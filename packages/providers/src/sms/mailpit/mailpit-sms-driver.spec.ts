import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import { SmsSendRefused } from '../sms-driver';
import { MailpitSmsDriver } from './mailpit-sms-driver';

describe('MailpitSmsDriver', () => {
  it.each([554, 421])('refuses on SMTP reply %s without exposing recipient data', async (code) => {
    const server = createServer((socket) =>
      socket.end(`${code} rejected +8801700000000 secret-code\r\n`),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: address.port,
      apiUrl: 'http://127.0.0.1:1',
    });
    try {
      const error = await driver
        .send({ to: '+8801700000000', text: 'secret-code' })
        .catch((error: unknown) => error);
      expect(error).toBeInstanceOf(SmsSendRefused);
      expect(error).toMatchObject({
        code: 'SMS_SEND_REFUSED',
        message: 'SMS refused by the provider',
      });
      expect(error).not.toHaveProperty('cause');
      expect(JSON.stringify(error)).not.toContain('+8801700000000');
      expect(JSON.stringify(error)).not.toContain('secret-code');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('refuses before SMTP when the idempotency lookup is unavailable', async () => {
    let submissions = 0;
    const server = createServer((socket) => {
      submissions++;
      socket.end('554 refused\r\n');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: address.port,
      apiUrl: 'http://127.0.0.1:1',
    });
    vi.stubGlobal('fetch', async () => new Response('Lookup unavailable', { status: 503 }));
    try {
      await expect(
        driver.send({ to: '+8801700000000', text: 'secret-code', idempotencyKey: 'campaign-1' }),
      ).rejects.toBeInstanceOf(SmsSendRefused);
      expect(submissions).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      server.close();
      await once(server, 'close');
    }
  });

  it.each([true, false])(
    'reconciles a post-DATA 451 when a capture is found (%s)',
    async (found) => {
      const driver = new MailpitSmsDriver({
        host: '127.0.0.1',
        port: 1,
        apiUrl: 'http://127.0.0.1:1',
      });
      vi.spyOn(driver['transport'], 'sendMail').mockRejectedValue(
        Object.assign(new Error('SMTP refused after DATA'), { responseCode: 451, command: 'DATA' }),
      );
      const lookup = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ messages: [] }))
        .mockResolvedValueOnce(
          found
            ? Response.json({ messages: [{ ID: 'first-capture' }] })
            : new Response(null, { status: 503 }),
        );
      vi.stubGlobal('fetch', lookup);
      try {
        const sent = driver.send({
          to: '+8801700000000',
          text: 'secret-code',
          idempotencyKey: 'campaign-451',
        });
        if (found) await expect(sent).resolves.toEqual({ providerMessageId: 'first-capture' });
        else await expect(sent).rejects.toMatchObject({ code: 'SMS_SEND_FAILED' });
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('reports an unknown outcome, not a refusal, when the server stops answering', async () => {
    const sockets: Socket[] = [];
    const server = createServer((socket) => void sockets.push(socket));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: address.port,
      apiUrl: 'http://127.0.0.1:1',
    });
    try {
      const error = await driver
        .send({ to: '+8801700000000', text: 'secret-code' })
        .catch((error: unknown) => error);
      expect(error).not.toBeInstanceOf(SmsSendRefused);
      expect(error).toMatchObject({ code: 'SMS_SEND_FAILED', message: 'SMS delivery failed' });
      expect(JSON.stringify(error)).not.toContain('+8801700000000');
    } finally {
      for (const socket of sockets) socket.destroy();
      server.close();
      await once(server, 'close');
    }
  }, 15_000);
});
