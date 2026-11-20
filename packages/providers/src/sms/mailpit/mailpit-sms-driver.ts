import { createTransport } from 'nodemailer';
import { z } from 'zod';

import {
  type SmsDriver,
  type SmsMessage,
  type SmsReceipt,
  type SmsReceiptStatus,
  type SmsSendResult,
  SmsSendRefused,
} from '../sms-driver';

const SHARED_FROM = 'dakly@sms.dakly.test';
const captureId = z.string().refine((value) => value.trim().length > 0);
const captureSearch = z.object({
  messages: z.array(z.object({ ID: captureId, MessageID: captureId })),
});

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

  async send(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult> {
    const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
    if (messageId) {
      const earlier = await this.findCaptured(messageId, signal).catch(() => {
        throw new SmsSendRefused();
      });
      if (earlier) return { providerMessageId: earlier };
    }
    return this.submit(message, messageId, signal);
  }

  async receiptStatus({
    providerMessageId,
    idempotencyKey,
  }: SmsReceipt): Promise<SmsReceiptStatus> {
    const messageId = `${idempotencyKey}@sms.dakly.test`;
    const captured = await this.findCaptured(messageId, undefined, providerMessageId);
    // A capture may have been removed after retention, so absence is not proof of refusal.
    return captured ? 'sent' : 'unknown';
  }

  private async submit(
    message: SmsMessage,
    messageId?: string,
    signal?: AbortSignal,
  ): Promise<SmsSendResult> {
    let response = '';
    try {
      ({ response } = await this.transport.sendMail({
        // The store's sender shows as the From name; the shared sender has none.
        from: message.sender ? { name: message.sender, address: SHARED_FROM } : SHARED_FROM,
        to: `${message.to}@sms.test`,
        subject: 'SMS',
        text: message.text,
        messageId: messageId ? `<${messageId}>` : undefined,
      }));
    } catch (error) {
      if (isSmtpRefusal(error)) throw new SmsSendRefused();
    }
    // Mailpit can store a message without returning a queue id, including on a lost reply.
    const providerMessageId =
      /queued as ([\w-]+)$/u.exec(response)?.[1] ??
      (messageId ? await this.findCaptured(messageId, signal).catch(() => undefined) : undefined);
    if (!providerMessageId) {
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
    return { providerMessageId };
  }

  // A retained capture lets a later send recover its id by Message-ID.
  private async findCaptured(
    messageId: string,
    signal?: AbortSignal,
    providerMessageId?: string,
  ): Promise<string | undefined> {
    const query = new URLSearchParams({ query: `message-id:"${messageId}"`, limit: '100' });
    const deadline = AbortSignal.timeout(5000);
    const response = await fetch(`${this.apiUrl}/api/v1/search?${query}`, {
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok) throw new Error('Mailpit search failed');
    const { messages } = captureSearch.parse(await response.json());
    // Mailpit searches substrings, so only an exact Message-ID proves a prior submission.
    return messages.find(
      ({ ID, MessageID }) =>
        MessageID === messageId && (!providerMessageId || ID === providerMessageId),
    )?.ID;
  }
}

type SmtpFailure = {
  responseCode?: unknown;
  command?: unknown;
  code?: unknown;
  syscall?: unknown;
};

function isSmtpRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { responseCode, command, code, syscall } = error as Error & SmtpFailure;
  if (syscall === 'connect' || code === 'EDNS') return true;
  if (typeof responseCode !== 'number' || responseCode < 400 || responseCode >= 600) return false;
  // Nodemailer uses EENVELOPE for a rejected DATA command and EMESSAGE for the final body reply.
  return code === 'EENVELOPE' || code === 'EPROTOCOL' || command === 'EHLO';
}
