import { type SmsDriver, type SmsMessage, type SmsSendResult } from './sms-driver';

export class FakeSmsDriver implements SmsDriver {
  readonly messages: SmsMessage[] = [];
  private readonly resultsByKey = new Map<string, SmsSendResult>();

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const earlier = message.idempotencyKey && this.resultsByKey.get(message.idempotencyKey);
    if (earlier) return earlier;
    this.messages.push({ ...message });
    const result = { providerMessageId: `fake-sms-${this.messages.length}` };
    if (message.idempotencyKey) this.resultsByKey.set(message.idempotencyKey, result);
    return result;
  }
}
