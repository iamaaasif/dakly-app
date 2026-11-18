import { createTransport } from 'nodemailer';

import { type SmsDriver, type SmsMessage, type SmsSendResult, SmsSendRefused } from '../sms-driver';

const SHARED_FROM = 'dakly@sms.dakly.test';

export class MailpitSmsDriver implements SmsDriver {
  private readonly transport;
  private readonly apiUrl: string;

  constructor({ apiUrl, ...options }: { host: string; port: number; apiUrl: string }) {
    this.apiUrl = apiUrl;
    this.transport = createTransport({
      ...options,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      dnsTimeout: 5000,
      logger: false,
      debug: false,
    });
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
    const earlier =
      messageId &&
      (await this.findCaptured(messageId).catch(() => {
        // SMTP has not been called. The caller may still need to reconcile an earlier attempt.
        throw new SmsSendRefused();
      }));
    if (earlier) return { providerMessageId: earlier };

    try {
      const result = await this.transport.sendMail({
        // The store's sender shows as the From name; the shared sender has none.
        from: message.sender ? { name: message.sender, address: SHARED_FROM } : SHARED_FROM,
        to: `${message.to}@sms.test`,
        subject: 'SMS',
        text: message.text,
        messageId: messageId ? `<${messageId}>` : undefined,
      });
      // A duplicate accepted by Mailpit returns no queue id. Recover the original capture.
      const providerMessageId =
        /queued as ([\w-]+)$/u.exec(result.response)?.[1] ??
        (messageId ? await this.findCaptured(messageId) : undefined);
      if (!providerMessageId) throw new Error('Missing Mailpit message id');
      return { providerMessageId };
    } catch (error) {
      // Mailpit can return 451 after storing DATA if tagging the capture fails.
      const { responseCode, command } = (error ?? {}) as {
        responseCode?: unknown;
        command?: unknown;
      };
      if (responseCode === 451 && command === 'DATA') {
        const captured = messageId && (await this.findCaptured(messageId).catch(() => undefined));
        if (captured) return { providerMessageId: captured };
      } else if (typeof responseCode === 'number' && responseCode >= 400 && responseCode < 600) {
        throw new SmsSendRefused();
      }
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
  }

  // Mailpit deduplicates by Message-ID. A real SMS driver's client reference comes with ACC-14.
  private async findCaptured(messageId: string): Promise<string | undefined> {
    const query = new URLSearchParams({ query: `message-id:"${messageId}"`, limit: '1' });
    const response = await fetch(`${this.apiUrl}/api/v1/search?${query}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Mailpit search failed');
    const found = (await response.json()) as { messages: { ID: string }[] };
    return found.messages[0]?.ID;
  }
}
