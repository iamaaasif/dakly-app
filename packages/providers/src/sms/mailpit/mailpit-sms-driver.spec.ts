import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import { SmsSendRefused } from '../sms-driver';
import { MailpitSmsDriver } from './mailpit-sms-driver';

function smtpPeer(afterData: (socket: Socket) => void) {
  return createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 smtp.test ESMTP\r\n');
    let buffer = '';
    let receivingBody = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let end = buffer.indexOf('\r\n');
      while (end >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (receivingBody && line === '.') return afterData(socket);
        if (!receivingBody) {
          receivingBody = line === 'DATA';
          socket.write(receivingBody ? '354 send the message\r\n' : '250 OK\r\n');
        }
        end = buffer.indexOf('\r\n');
      }
    });
  });
}

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
            ? Response.json({
                messages: [{ ID: 'first-capture', MessageID: 'campaign-451@sms.dakly.test' }],
              })
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

  it('finds the full operation id past a substring match', async () => {
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: 1,
      apiUrl: 'http://127.0.0.1:1',
    });
    const substringMatches = Array.from({ length: 100 }, (_, index) => ({
      ID: `unrelated-${index}`,
      MessageID: `other-${index}-campaign-1@sms.dakly.test`,
    }));
    const offsets: string[] = [];
    const lookup = vi.fn((url: string) => {
      const offset = new URL(url).searchParams.get('start') ?? '';
      offsets.push(offset);
      expect(offset).toBe(offsets.length === 1 ? '0' : '100');
      return Promise.resolve(
        Response.json({
          messages:
            offset === '0'
              ? substringMatches
              : [{ ID: 'matching', MessageID: 'campaign-1@sms.dakly.test' }],
          messages_count: 101,
          total: 500,
        }),
      );
    });
    vi.stubGlobal('fetch', lookup);
    try {
      await expect(
        driver.send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
      ).resolves.toEqual({ providerMessageId: 'matching' });
      expect(offsets).toEqual(['0', '100']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('recovers the first capture after a duplicate SMTP acknowledgment', async () => {
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: 1,
      apiUrl: 'http://127.0.0.1:1',
    });
    const submit = vi.spyOn(driver['transport'], 'sendMail').mockResolvedValue({
      response: '250 2.0.0 Ok: queued',
    });
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0, total: 0 }))
      .mockResolvedValueOnce(
        Response.json({
          messages: [{ ID: 'first-capture', MessageID: 'campaign-1@sms.dakly.test' }],
          messages_count: 1,
          total: 1,
        }),
      );
    vi.stubGlobal('fetch', lookup);
    try {
      await expect(
        driver.send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
      ).resolves.toEqual({ providerMessageId: 'first-capture' });
      expect(submit).toHaveBeenCalledTimes(1);
      expect(lookup).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('submits after exhausting the matching pages without an exact capture', async () => {
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: 1,
      apiUrl: 'http://127.0.0.1:1',
    });
    vi.spyOn(driver['transport'], 'sendMail').mockResolvedValue({
      response: '250 queued as new-capture',
    });
    const lookup = vi.fn().mockResolvedValueOnce(
      Response.json({
        messages: [{ ID: 'unrelated', MessageID: 'other-campaign-1@sms.dakly.test' }],
        messages_count: 1,
        total: 500,
      }),
    );
    vi.stubGlobal('fetch', lookup);
    try {
      await expect(
        driver.send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
      ).resolves.toEqual({ providerMessageId: 'new-capture' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([true, false])(
    'reconciles a truncated 451 after DATA when a capture exists (%s)',
    async (found) => {
      const server = smtpPeer((socket) => socket.end('451 4.3'));
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test server port');
      const driver = new MailpitSmsDriver({
        host: '127.0.0.1',
        port: address.port,
        apiUrl: 'http://127.0.0.1:1',
      });
      const lookup = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ messages: [] }))
        .mockResolvedValueOnce(
          found
            ? Response.json({
                messages: [{ ID: 'first-capture', MessageID: 'partial-451@sms.dakly.test' }],
              })
            : new Response(null, { status: 503 }),
        );
      vi.stubGlobal('fetch', lookup);
      try {
        const sent = driver.send({
          to: '+8801700000000',
          text: 'SMS',
          idempotencyKey: 'partial-451',
        });
        if (found) await expect(sent).resolves.toEqual({ providerMessageId: 'first-capture' });
        else await expect(sent).rejects.toMatchObject({ code: 'SMS_SEND_FAILED' });
        expect(lookup).toHaveBeenCalledTimes(2);
      } finally {
        vi.unstubAllGlobals();
        server.close();
        await once(server, 'close');
      }
    },
  );

  it('reports an unknown outcome, not a refusal, when the server stops answering after DATA', async () => {
    const server = smtpPeer((socket) => socket.end());
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
      server.close();
      await once(server, 'close');
    }
  });

  it('refuses when the SMTP greeting times out before any submission', async () => {
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
      await expect(
        driver.send({ to: '+8801700000000', text: 'secret-code' }),
      ).rejects.toBeInstanceOf(SmsSendRefused);
    } finally {
      for (const socket of sockets) socket.destroy();
      server.close();
      await once(server, 'close');
    }
  }, 15_000);
});
