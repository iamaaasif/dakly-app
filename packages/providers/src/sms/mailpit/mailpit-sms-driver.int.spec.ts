import { randomUUID } from 'node:crypto';

import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';

import { MailpitSmsDriver } from './mailpit-sms-driver';

describe('MailpitSmsDriver (SMTP and API)', () => {
  it('captures the phone and Bangla text under the returned provider message id', async () => {
    const apiUrl = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
    const driver = new MailpitSmsDriver({
      host: process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
      apiUrl,
    });
    const { providerMessageId } = await driver.send({
      to: '+8801700000000',
      text: 'আপনার কোড 123456\nশুধু পরীক্ষার জন্য।',
    });
    expect(providerMessageId).not.toBe('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/message/${providerMessageId}`, {
        signal: AbortSignal.timeout(5000),
      });
      expect(response.status).toBe(200);
      const message = (await response.json()) as { To: { Address: string }[]; Text: string };
      expect(message.To).toEqual([{ Name: '', Address: '+8801700000000@sms.test' }]);
      expect(message.Text.trimEnd()).toBe('আপনার কোড 123456\nশুধু পরীক্ষার জন্য।');
    } finally {
      const response = await fetch(`${apiUrl}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [providerMessageId] }),
        signal: AbortSignal.timeout(5000),
      });
      expect(response.ok).toBe(true);
    }
  });

  it('recovers the first capture on retry and Mailpit suppresses the duplicate Message-ID', async () => {
    const apiUrl = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
    const smtp = {
      host: process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
    };
    const driver = new MailpitSmsDriver({ ...smtp, apiUrl });
    const idempotencyKey = randomUUID();
    const message = { to: '+8801700000000', text: 'শুধু পরীক্ষার জন্য।', idempotencyKey };
    const query = new URLSearchParams({ query: `message-id:"${idempotencyKey}@sms.dakly.test"` });
    const captures = async () => {
      const response = await fetch(`${apiUrl}/api/v1/search?${query}`, {
        signal: AbortSignal.timeout(5000),
      });
      expect(response.status).toBe(200);
      return ((await response.json()) as { messages: { ID: string }[] }).messages;
    };

    try {
      const receipt = await driver.send(message);
      expect(await driver.send(message)).toEqual(receipt);
      expect((await captures()).map(({ ID }) => ID)).toEqual([receipt.providerMessageId]);
      await createTransport({ ...smtp, secure: false, ignoreTLS: true }).sendMail({
        from: 'sms@sms.dakly.test',
        to: `${message.to}@sms.test`,
        subject: 'SMS',
        text: message.text,
        messageId: `<${idempotencyKey}@sms.dakly.test>`,
      });
      expect((await captures()).map(({ ID }) => ID)).toEqual([receipt.providerMessageId]);
    } finally {
      const ids = (await captures()).map(({ ID }) => ID);
      if (ids.length) {
        const response = await fetch(`${apiUrl}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: ids }),
          signal: AbortSignal.timeout(5000),
        });
        expect(response.ok).toBe(true);
      }
    }
  });
});
