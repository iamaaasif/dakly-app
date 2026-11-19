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
const captureSearch = z.object({
  messages: z.array(z.object({ ID: captureId, MessageID: captureId })),
});

export class MailpitSmsDriver implements SmsDriver {
  private readonly smtp: { host: string; port: number };
  private readonly transport;
  private readonly apiUrl: string;

  constructor({ apiUrl, ...options }: { host: string; port: number; apiUrl: string }) {
    this.apiUrl = apiUrl;
    this.smtp = options;
    this.transport = this.transportForSignal();
  }

  async send(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult> {
    if (signal?.aborted) throw new SmsSendTimeout();
    const messageId = message.idempotencyKey && `${message.idempotencyKey}@sms.dakly.test`;
    if (messageId) {
      const earlier = await this.findCaptured(messageId, signal).catch(() => {
        if (signal?.aborted) throw new SmsSendTimeout();
        throw new SmsSendRefused();
      });
      if (earlier) return { providerMessageId: earlier };
    }
    return this.submit(message, messageId, signal);
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
      const transport = signal ? this.transportForSignal(signal) : this.transport;
      const { response } = await transport.sendMail({
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

  private transportForSignal(signal?: AbortSignal) {
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
        const failed = () => {
          clearTimeout(timer);
          // This socket has not connected, so it could not have submitted DATA.
          const failure = signal.aborted ? new SmsSendTimeout() : new SmsSendRefused();
          done(failure, false);
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
    const response = await fetch(`${this.apiUrl}/api/v1/search?${query}`, {
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok) throw new Error('Mailpit search failed');
    const { messages } = captureSearch.parse(await response.json());
    // Mailpit searches substrings, so only an exact Message-ID proves a prior submission.
    return messages.find(({ MessageID }) => MessageID === messageId)?.ID;
  }
}

type SmtpFailure = {
  responseCode?: unknown;
  command?: unknown;
  code?: unknown;
  syscall?: unknown;
};

function isSmtpRefusal(error: unknown): boolean {
  if (error instanceof SmsSendRefused) return true;
  if (!(error instanceof Error)) return false;
  const { responseCode, command, code, syscall } = error as Error & SmtpFailure;
  if (syscall === 'connect' || code === 'EDNS') return true;
  if (typeof responseCode !== 'number' || responseCode < 400 || responseCode >= 600) return false;
  // Nodemailer uses EENVELOPE for a rejected DATA command and EMESSAGE for the final body reply.
  return code === 'EENVELOPE' || code === 'EPROTOCOL' || command === 'EHLO';
}
