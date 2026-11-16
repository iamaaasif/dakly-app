// The provider accepts a message once per idempotency key and returns the first result again.
export type SmsMessage = { to: string; text: string; idempotencyKey?: string };

export type SmsSendResult = { providerMessageId: string };

export type SmsDriver = {
  send(message: SmsMessage): Promise<SmsSendResult>;
};
