// Retries reuse the idempotency key so the driver can recover a previous result.
// Without a sender the message goes from Dakly's shared sender.
export type SmsMessage = { to: string; text: string; idempotencyKey?: string; sender?: string };

export type SmsSendResult = { providerMessageId: string };

// SmsSendRefused means this attempt did not reach provider acceptance. Any other send error
// leaves the outcome unknown. Callers reconcile earlier attempts and apply their send rules
// before retrying under the same key.
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
