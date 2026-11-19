import { createConnection } from 'node:net';

import { createTransport } from 'nodemailer';

import { type SmsDriver, type SmsMessage, type SmsSendResult, SmsSendTimeout } from '../sms-driver';

const SHARED_FROM = 'dakly@sms.dakly.test';
const CONNECT_TIMEOUT_MS = 5000;

export class MailpitSmsDriver implements SmsDriver {
  private readonly smtp: { host: string; port: number };
  private readonly apiUrl: string;

  constructor({ apiUrl, ...options }: { host: string; port: number; apiUrl: string }) {
    this.apiUrl = apiUrl;
    this.smtp = options;
  }

  async send(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult> {
    try {
      const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
      const earlier = messageId && (await this.findCaptured(messageId, signal));
      if (earlier) return { providerMessageId: earlier };
      return await this.submit(message, messageId, signal);
    } catch {
      if (signal?.aborted) throw new SmsSendTimeout();
      // SMTP errors can contain the recipient or body. Keep them inside the driver.
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
  }

  private async submit(message: SmsMessage, messageId?: string, signal?: AbortSignal) {
    const result = await this.transport(signal).sendMail({
      // The store's sender shows as the From name; the shared sender has none.
      from: message.sender ? { name: message.sender, address: SHARED_FROM } : SHARED_FROM,
      to: `${message.to}@sms.test`,
      subject: 'SMS',
      text: message.text,
      messageId: messageId ? `<${messageId}>` : undefined,
    });
    // Mailpit's queue id identifies the captured message in its API and UI.
    const providerMessageId = /queued as ([\w-]+)$/u.exec(result.response)?.[1];
    if (!providerMessageId) throw new Error('Missing Mailpit message id');
    return { providerMessageId };
  }

  private transport(signal?: AbortSignal) {
    return createTransport({
      ...this.smtp,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      dnsTimeout: CONNECT_TIMEOUT_MS,
      logger: false,
      debug: false,
      getSocket: (_options, done) => {
        if (!signal) return done(null, false);
        const socket = createConnection({ ...this.smtp, signal });
        const timer = setTimeout(() => {
          socket.destroy(
            Object.assign(new Error('SMTP connection timed out'), {
              timeoutType: 'CONNECT_TIMEOUT',
            }),
          );
        }, CONNECT_TIMEOUT_MS);
        const failed = (error: Error) => {
          clearTimeout(timer);
          done(error, false);
        };
        socket.once('error', failed);
        socket.once('connect', () => {
          clearTimeout(timer);
          socket.off('error', failed);
          done(null, { connection: socket });
        });
      },
    });
  }

  // Check-then-act: it only stands in for a real aggregator's client reference until ACC-14.
  private async findCaptured(messageId: string, signal?: AbortSignal): Promise<string | undefined> {
    const query = new URLSearchParams({ query: `message-id:"${messageId}"`, limit: '1' });
    const deadline = AbortSignal.timeout(5000);
    const response = await fetch(`${this.apiUrl}/api/v1/search?${query}`, {
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok) throw new Error('Mailpit search failed');
    const found = (await response.json()) as { messages: { ID: string }[] };
    return found.messages[0]?.ID;
  }
}
