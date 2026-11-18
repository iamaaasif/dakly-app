// The provider accepts a message once per idempotency key and returns the first result again.
// Without a sender the message goes from Dakly's shared sender.
export type SmsMessage = { to: string; text: string; idempotencyKey?: string; sender?: string };

export type SmsSendResult = { providerMessageId: string };

export type SmsDriver = {
  send(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult>;
};

// The provider might already have accepted the message when the caller cancels the request.
export class SmsSendTimeout extends Error {
  readonly code = 'SMS_SEND_TIMEOUT';

  constructor() {
    super('The SMS provider did not answer in time');
    this.name = 'SmsSendTimeout';
  }
}
