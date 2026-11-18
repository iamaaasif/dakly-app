import { createTransport } from 'nodemailer';

import { type SmsDriver, type SmsMessage, type SmsSendResult, SmsSendRefused } from '../sms-driver';

const SHARED_FROM = 'dakly@sms.dakly.test';

export class MailpitSmsDriver implements SmsDriver {
  private readonly transport;
  private readonly apiUrl: string;
  private readonly pending = new Map<string, Promise<SmsSendResult>>();

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

  send(message: SmsMessage): Promise<SmsSendResult> {
    const { idempotencyKey } = message;
    if (!idempotencyKey) return this.sendOnce(message);
    const pending = this.pending.get(idempotencyKey);
    if (pending) return pending;
    const sending = this.sendOnce(message).finally(() => this.pending.delete(idempotencyKey));
    this.pending.set(idempotencyKey, sending);
    return sending;
  }

  private async sendOnce(message: SmsMessage): Promise<SmsSendResult> {
    const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
    const earlier = await this.findBeforeSubmission(messageId);
    if (earlier) return { providerMessageId: earlier };

    try {
      return await this.submit(message, messageId);
    } catch (error) {
      return this.resolveSmtpError(error, messageId);
    }
  }

  private async findBeforeSubmission(messageId?: string): Promise<string | undefined> {
    if (!messageId) return undefined;
    try {
      return await this.findCaptured(messageId);
    } catch {
      // SMTP has not been called. The caller may still need to reconcile an earlier attempt.
      throw new SmsSendRefused();
    }
  }

  private async submit(message: SmsMessage, messageId?: string): Promise<SmsSendResult> {
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
  }

  private async resolveSmtpError(error: unknown, messageId?: string): Promise<SmsSendResult> {
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

  // A retained capture lets a later send recover its id by Message-ID.
  private async findCaptured(messageId: string): Promise<string | undefined> {
    const query = new URLSearchParams({ query: `message-id:"${messageId}"`, limit: '100' });
    const signal = AbortSignal.timeout(5000);
    let start = 0;
    // Mailpit searches substrings, so only an exact Message-ID proves a prior submission.
    for (;;) {
      query.set('start', String(start));
      const response = await fetch(`${this.apiUrl}/api/v1/search?${query}`, { signal });
      if (!response.ok) throw new Error('Mailpit search failed');
      const { messages, messages_count } = (await response.json()) as {
        messages: { ID: string; MessageID: string }[];
        messages_count: number;
      };
      const match = messages.find(({ MessageID }) => MessageID === messageId);
      if (match) return match.ID;
      start += messages.length;
      if (messages.length === 0 || start >= messages_count) return undefined;
    }
  }
}
