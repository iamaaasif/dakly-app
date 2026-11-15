export type SmsMessage = { to: string; text: string };

export type SmsSendResult = { providerMessageId: string };

export type SmsDriver = {
  send(message: SmsMessage): Promise<SmsSendResult>;
};
