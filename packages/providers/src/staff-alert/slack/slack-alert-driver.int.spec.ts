import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SlackAlertDriver } from './slack-alert-driver';

let origin: string;
let status = 200;
let result: unknown = { ok: true };
let hold = false;
const received: Array<{ headers: Record<string, unknown>; body: Record<string, unknown> }> = [];
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  received.push({ headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
  if (hold) return;
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(result));
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const credentials = { token: 'local-fixture-secret', channel: 'CFIXTURE' };
const driver = new SlackAlertDriver((url, options) => {
  expect(url).toBe('https://slack.com/api/chat.postMessage');
  expect(options?.redirect).toBe('error');
  return fetch(origin, options);
});
describe('Slack alert driver through a local HTTP fixture', () => {
  it('sends stable event identity and plain text to the configured channel', async () => {
    status = 200;
    result = { ok: true };
    hold = false;
    const id = randomUUID();
    await driver.send({ id, text: 'Synthetic alert' }, credentials);
    expect(received.at(-1)?.body).toMatchObject({
      client_msg_id: id,
      channel: 'CFIXTURE',
      text: 'Synthetic alert',
      mrkdwn: false,
      unfurl_links: false,
    });
    expect(received.at(-1)?.headers.authorization).toBe('Bearer local-fixture-secret');
  });
  it.each([200, 429, 503])(
    'rejects HTTP %s and never exposes response credentials or text',
    async (code) => {
      status = code;
      result = { ok: false, error: 'local-fixture-secret private-message' };
      await expect(
        driver.send({ id: randomUUID(), text: 'Synthetic alert' }, credentials),
      ).rejects.toMatchObject({
        message: 'Staff alert delivery failed',
        code: 'STAFF_ALERT_SEND_FAILED',
      });
    },
  );
  it('bounds a stalled provider request to five seconds', async () => {
    hold = true;
    const start = Date.now();
    await expect(
      driver.send({ id: randomUUID(), text: 'Synthetic alert' }, credentials),
    ).rejects.toThrow('Staff alert delivery failed');
    expect(Date.now() - start).toBeLessThan(6500);
    hold = false;
  }, 10000);
});
