import { createTransport } from 'nodemailer';
import { z } from 'zod';

import { type SmsDriver, type SmsMessage, type SmsSendResult, SmsSendRefused } from '../sms-driver';

const SHARED_FROM = 'dakly@sms.dakly.test';
const captureId = z.string().refine((value) => value.trim().length > 0);
const capturePage = z.object({
  messages: z.array(z.object({ ID: captureId, MessageID: captureId })),
  messages_count: z.int().nonnegative(),
});

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

    return this.submit(message, messageId);
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
      (messageId ? await this.findCaptured(messageId).catch(() => undefined) : undefined);
    if (!providerMessageId) {
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
    return { providerMessageId };
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
      const page = capturePage.safeParse(await response.json());
      if (
        !page.success ||
        page.data.messages_count < start + page.data.messages.length ||
        (page.data.messages.length === 0 && start < page.data.messages_count)
      )
        throw new Error('Invalid Mailpit search response');
      const { messages, messages_count } = page.data;
      const match = messages.find(({ MessageID }) => MessageID === messageId);
      if (match) return match.ID;
      start += messages.length;
      if (start >= messages_count) return undefined;
    }
  }
}

type SmtpFailure = {
  responseCode?: unknown;
  command?: unknown;
  code?: unknown;
  originalCode?: unknown;
  timeoutType?: unknown;
  syscall?: unknown;
};

function isSmtpRefusal(error: unknown): boolean {
  const failure = (error ?? {}) as SmtpFailure;
  if (error instanceof AggregateError) return failedAllConnectAttempts(error, failure);
  if (failedDuringSetup(failure)) return true;
  const { responseCode, command, code } = failure;
  // ECONNECTION on CONN can include an incomplete reply left in the receive buffer.
  if (code === 'ECONNECTION' && command === 'CONN') return false;
  // Mailpit can return 451 after storing DATA if tagging the capture fails.
  if (responseCode === 451 && code === 'EMESSAGE' && command === 'DATA') return false;
  return isSmtpRejection(responseCode);
}

function failedAllConnectAttempts(error: AggregateError, { code, command }: SmtpFailure): boolean {
  const attempts: unknown = error.errors;
  return (
    code === 'ESOCKET' &&
    command === 'CONN' &&
    Array.isArray(attempts) &&
    attempts.length > 0 &&
    attempts.every(
      (attempt: unknown) =>
        attempt instanceof Error && 'syscall' in attempt && attempt.syscall === 'connect',
    )
  );
}

function failedDuringSetup({ code, originalCode, timeoutType, syscall }: SmtpFailure): boolean {
  return (
    code === 'EDNS' ||
    originalCode === 'ECONNREFUSED' ||
    syscall === 'connect' ||
    timeoutType === 'CONNECT_TIMEOUT' ||
    timeoutType === 'GREETING_TIMEOUT'
  );
}

function isSmtpRejection(responseCode: unknown): boolean {
  return typeof responseCode === 'number' && responseCode >= 400 && responseCode < 600;
}
