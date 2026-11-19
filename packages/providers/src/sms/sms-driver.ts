// Retries reuse the idempotency key so the driver can recover a previous result.
// Without a sender the message goes from Dakly's shared sender.
export type SmsMessage = { to: string; text: string; idempotencyKey?: string; sender?: string };

export type SmsSendResult = { providerMessageId: string };

// SmsSendRefused means this attempt did not reach provider acceptance. Any other send error
// leaves the outcome unknown. Callers reconcile earlier attempts and apply their send rules
// before retrying under the same key.
export type SmsDriver = {
  send(message: SmsMessage, signal?: AbortSignal): Promise<SmsSendResult>;
};

export class SmsSendRefused extends Error {
  readonly code = 'SMS_SEND_REFUSED';

  constructor() {
    super('SMS refused by the provider');
    this.name = 'SmsSendRefused';
  }
}

// The provider might already have accepted the message when the caller cancels the request.
export class SmsSendTimeout extends Error {
  readonly code = 'SMS_SEND_TIMEOUT';

  constructor() {
    super('The SMS provider did not answer in time');
    this.name = 'SmsSendTimeout';
  }
}
