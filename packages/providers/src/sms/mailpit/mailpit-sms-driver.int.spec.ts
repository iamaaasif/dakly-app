import { randomUUID } from 'node:crypto';

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

  it('returns a single capture when concurrent sends share an operation key', async () => {
    const apiUrl = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';
    const driver = new MailpitSmsDriver({
      host: process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
      apiUrl,
    });
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
      const receipts = await Promise.all(Array.from({ length: 4 }, () => driver.send(message)));
      expect(new Set(receipts.map(({ providerMessageId }) => providerMessageId)).size).toBe(1);
      expect((await captures()).map(({ ID }) => ID)).toEqual([receipts[0]?.providerMessageId]);
      expect(await driver.send(message)).toEqual(receipts[0]);
    } finally {
      const response = await fetch(`${apiUrl}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: (await captures()).map(({ ID }) => ID) }),
        signal: AbortSignal.timeout(5000),
      });
      expect(response.ok).toBe(true);
    }
  });
});
