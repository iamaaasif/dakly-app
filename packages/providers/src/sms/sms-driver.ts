// The provider accepts a message once per idempotency key and returns the first result again.
// Without a sender the message goes from Dakly's shared sender.
export type SmsMessage = { to: string; text: string; idempotencyKey?: string; sender?: string };

export type SmsSendResult = { providerMessageId: string };

// The contract every SMS driver keeps: send throws SmsSendRefused only when the provider
// definitely did not take the message. Any other error, a timeout included, means the outcome
// is unknown, and the caller sends again under the same idempotency key.
export type SmsDriver = {
  send(message: SmsMessage): Promise<SmsSendResult>;
};

export class SmsSendRefused extends Error {
  readonly code = 'SMS_SEND_REFUSED';

  constructor() {
    super('SMS refused by the provider');
    this.name = 'SmsSendRefused';
  }
}
