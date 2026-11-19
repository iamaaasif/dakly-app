import { createConnection } from 'node:net';

import { createTransport } from 'nodemailer';
import { z } from 'zod';

import {
  type SmsDriver,
  type SmsMessage,
  type SmsSendResult,
  SmsSendRefused,
  SmsSendTimeout,
} from '../sms-driver';

const SHARED_FROM = 'dakly@sms.dakly.test';
const CONNECT_TIMEOUT_MS = 5000;
const captureId = z.string().refine((value) => value.trim().length > 0);
const capturePage = z.object({
  messages: z.array(z.object({ ID: captureId, MessageID: captureId })),
  messages_count: z.int().nonnegative(),
});

export class MailpitSmsDriver implements SmsDriver {
  private readonly smtp: { host: string; port: number };
  private readonly apiUrl: string;
  private readonly pending = new Map<string, Promise<SmsSendResult>>();

  constructor({ apiUrl, ...options }: { host: string; port: number; apiUrl: string }) {
    this.apiUrl = apiUrl;
    this.smtp = options;
  }

  send(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult> {
    if (signal?.aborted) return Promise.reject(new SmsSendTimeout());
    const { idempotencyKey } = message;
    if (!idempotencyKey) return this.sendOnce(message, signal);
    const pending = this.pending.get(idempotencyKey);
    if (pending) return pending;
    const sending = this.sendOnce(message, signal).finally(() =>
      this.pending.delete(idempotencyKey),
    );
    this.pending.set(idempotencyKey, sending);
    return sending;
  }

  private async sendOnce(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult> {
    const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
    const earlier = await this.findBeforeSubmission(messageId, signal);
    if (earlier) return { providerMessageId: earlier };

    return this.submit(message, messageId, signal);
  }

  private async findBeforeSubmission(
    messageId?: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (!messageId) return undefined;
    try {
      return await this.findCaptured(messageId, signal);
    } catch {
      if (signal?.aborted) throw new SmsSendTimeout();
      // SMTP has not been called. The caller may still need to reconcile an earlier attempt.
      throw new SmsSendRefused();
    }
  }

  private async submit(
    message: SmsMessage,
    messageId?: string,
    signal?: AbortSignal,
  ): Promise<SmsSendResult> {
    const response = await this.smtpResponse(message, messageId, signal);
    // Mailpit can store a message without returning a queue id, including on a lost reply.
    const providerMessageId =
      /queued as ([\w-]+)$/u.exec(response)?.[1] ??
      (messageId ? await this.findCaptured(messageId, signal).catch(() => undefined) : undefined);
    if (!providerMessageId) {
      if (signal?.aborted) throw new SmsSendTimeout();
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
    return { providerMessageId };
  }

  private async smtpResponse(message: SmsMessage, messageId?: string, signal?: AbortSignal) {
    if (signal?.aborted) throw new SmsSendTimeout();
    try {
      const { response } = await this.transport(signal).sendMail({
        // The store's sender shows as the From name; the shared sender has none.
        from: message.sender ? { name: message.sender, address: SHARED_FROM } : SHARED_FROM,
        to: `${message.to}@sms.test`,
        subject: 'SMS',
        text: message.text,
        messageId: messageId ? `<${messageId}>` : undefined,
      });
      return response;
    } catch (error) {
      if (signal?.aborted) throw new SmsSendTimeout();
      if (isSmtpRefusal(error)) throw new SmsSendRefused();
      return '';
    }
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

  // A retained capture lets a later send recover its id by Message-ID.
  private async findCaptured(messageId: string, signal?: AbortSignal): Promise<string | undefined> {
    const query = new URLSearchParams({ query: `message-id:"${messageId}"`, limit: '100' });
    const deadline = AbortSignal.timeout(5000);
    const lookupSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let start = 0;
    // Mailpit searches substrings, so only an exact Message-ID proves a prior submission.
    for (;;) {
      query.set('start', String(start));
      const response = await fetch(`${this.apiUrl}/api/v1/search?${query}`, {
        signal: lookupSignal,
      });
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
