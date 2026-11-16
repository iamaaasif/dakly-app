import { createTransport } from 'nodemailer';

import { type SmsDriver, type SmsMessage, type SmsSendResult } from '../sms-driver';

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
    try {
      const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
      const earlier = messageId && (await this.findCaptured(messageId));
      if (earlier) return { providerMessageId: earlier };
      const result = await this.transport.sendMail({
        from: 'dakly@sms.dakly.test',
        to: `${message.to}@sms.test`,
        subject: 'SMS',
        text: message.text,
        messageId: messageId ? `<${messageId}>` : undefined,
      });
      // Mailpit's queue id identifies the captured message in its API and UI.
      const providerMessageId = /queued as ([\w-]+)$/u.exec(result.response)?.[1];
      if (!providerMessageId) throw new Error('Missing Mailpit message id');
      return { providerMessageId };
    } catch {
      // SMTP errors can contain the recipient or body. Keep them inside the driver.
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
  }

  // Check-then-act: it only stands in for a real aggregator's client reference until ACC-14.
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
