// The provider accepts a message once per idempotency key and returns the first result again.
// Without a sender the message goes from Dakly's shared sender.
export type SmsMessage = { to: string; text: string; idempotencyKey?: string; sender?: string };

export type SmsSendResult = { providerMessageId: string };

export type SmsDriver = {
  send(message: SmsMessage): Promise<SmsSendResult>;
};
