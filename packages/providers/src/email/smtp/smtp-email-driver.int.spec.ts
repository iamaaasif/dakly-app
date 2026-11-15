import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SmtpEmailDriver } from './smtp-email-driver';

describe('SmtpEmailDriver', () => {
  it('delivers the recipient, subject, Bangla text and HTML through Mailpit', async () => {
    const driver = new SmtpEmailDriver({
      host: process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
      from: 'auth@dakly.test',
    });
    const to = `${randomUUID()}@example.test`;
    const api = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
    await driver.send({
      to,
      subject: 'Your code',
      text: 'আপনার কোড 123456',
      html: '<p>আপনার কোড 123456</p>',
    });
    const found = await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages } = (await found.json()) as { messages: { ID: string }[] };
    expect(messages).toHaveLength(1);
    const id = messages[0]!.ID;
    try {
      const response = await fetch(`${api}/api/v1/message/${id}`);
      const message = (await response.json()) as {
        To: { Address: string }[];
        Subject: string;
        Text: string;
        HTML: string;
      };
      expect(message.To[0]!.Address).toBe(to);
      expect(message.Subject).toBe('Your code');
      expect(message.Text.trimEnd()).toBe('আপনার কোড 123456');
      expect(message.HTML.trimEnd()).toBe('<p>আপনার কোড 123456</p>');
    } finally {
      await fetch(`${api}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [id] }),
      });
    }
  });
});
