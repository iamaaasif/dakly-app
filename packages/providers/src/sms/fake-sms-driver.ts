import { type SmsDriver, type SmsMessage, type SmsSendResult } from './sms-driver';

export class FakeSmsDriver implements SmsDriver {
  readonly messages: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.messages.push({ ...message });
    return { providerMessageId: `fake-sms-${this.messages.length}` };
  }
}
