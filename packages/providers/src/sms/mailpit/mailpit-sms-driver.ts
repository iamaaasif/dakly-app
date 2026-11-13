import { createTransport } from 'nodemailer';
import { type SmsDriver, type SmsMessage, type SmsSendResult } from '../sms-driver';

export class MailpitSmsDriver implements SmsDriver {
  private readonly transport;

  constructor(options: { host: string; port: number }) {
    this.transport = createTransport({
      ...options,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      dnsTimeout: 5000,
      logger: false,
      debug: false,
    });
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    try {
      const result = await this.transport.sendMail({
        from: 'dakly@sms.dakly.test',
        to: `${message.to}@sms.dakly.test`,
        subject: 'SMS',
        text: message.text,
      });
      // Mailpit's queue id identifies the captured message in its API and UI.
      const providerMessageId = /queued as ([\w-]+)$/u.exec(result.response)?.[1];
      if (!providerMessageId) throw new Error('Missing Mailpit message id');
      return { providerMessageId };
    } catch {
      // SMTP errors can contain the recipient or body. Keep them inside the driver.
      throw Object.assign(new Error('SMS delivery failed'), { code: 'SMS_SEND_FAILED' });
    }
  }
}
