import { createTransport } from 'nodemailer';

import type { EmailDriver, EmailMessage } from '../email-driver';

export class SmtpEmailDriver implements EmailDriver {
  private readonly transport;
  constructor(private readonly options: { host: string; port: number; from: string }) {
    this.transport = createTransport({
      host: options.host,
      port: options.port,
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
  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.options.from, ...message });
    } catch {
      throw Object.assign(new Error('Email delivery failed'), { code: 'EMAIL_SEND_FAILED' });
    }
  }
}
