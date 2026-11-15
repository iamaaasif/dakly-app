import type { EmailDriver, EmailMessage } from '../email-driver';

export class SendGridEmailDriver implements EmailDriver {
  constructor(
    private readonly options: { apiKey: string; from: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const content = [{ type: 'text/plain', value: message.text }];
    if (message.html) content.push({ type: 'text/html', value: message.html });
    try {
      const response = await this.request('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: this.options.from },
          subject: message.subject,
          content,
        }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (response.status !== 202) throw new Error('Email rejected');
    } catch {
      throw Object.assign(new Error('Email delivery failed'), { code: 'EMAIL_SEND_FAILED' });
    }
  }
}
