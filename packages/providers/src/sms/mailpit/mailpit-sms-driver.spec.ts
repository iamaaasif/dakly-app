import net, { Socket } from 'node:net';
import { Duplex } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SmsSendRefused } from '../sms-driver';
import { MailpitSmsDriver } from './mailpit-sms-driver';

function connectSmtpPeer(
  onConnect: (socket: Duplex) => void,
  onWrite: (socket: Duplex, chunk: string) => void = () => {},
) {
  const socket = Object.assign(
    new Duplex({
      read() {},
      write(chunk: Buffer, _encoding, callback) {
        onWrite(this, chunk.toString());
        callback();
      },
      final(callback) {
        this.push(null);
        callback();
      },
    }),
    { setTimeout() {} },
  );
  return vi.spyOn(net, 'connect').mockImplementation((_options, connected?: () => void) => {
    setImmediate(() => {
      connected?.();
      onConnect(socket);
    });
    return socket as unknown as Socket;
  });
}

function smtpPeer(afterData: (socket: Duplex) => void) {
  let buffer = '';
  let receivingBody = false;
  connectSmtpPeer(
    (socket) => socket.push('220 smtp.test ESMTP\r\n'),
    (socket, chunk) => {
      buffer += chunk;
      let end = buffer.indexOf('\r\n');
      while (end >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (receivingBody && line === '.') {
          setImmediate(() => afterData(socket));
          return;
        }
        if (!receivingBody) {
          receivingBody = line === 'DATA';
          socket.push(receivingBody ? '354 send the message\r\n' : '250 OK\r\n');
        }
        end = buffer.indexOf('\r\n');
      }
    },
  );
}

function testDriver() {
  return new MailpitSmsDriver({
    host: '127.0.0.1',
    port: 1,
    apiUrl: 'http://127.0.0.1:1',
  });
}

describe('MailpitSmsDriver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([554, 421])('refuses on SMTP reply %s without exposing recipient data', async (code) => {
    connectSmtpPeer((socket) => {
      socket.push(`${code} rejected +8801700000000 secret-code\r\n`);
      socket.push(null);
    });
    const error = await testDriver()
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
  });

  it('refuses before SMTP when the idempotency lookup is unavailable', async () => {
    const connect = connectSmtpPeer((socket) => socket.push('554 refused\r\n'));
    vi.stubGlobal('fetch', async () => new Response('Lookup unavailable', { status: 503 }));
    await expect(
      testDriver().send({
        to: '+8801700000000',
        text: 'secret-code',
        idempotencyKey: 'campaign-1',
      }),
    ).rejects.toBeInstanceOf(SmsSendRefused);
    expect(connect).not.toHaveBeenCalled();
  });

  const matchingCapture = { ID: 'private-capture', MessageID: 'campaign-1@sms.dakly.test' };

  it.each([
    { name: 'non-array messages', page: { messages: {}, messages_count: 0 } },
    {
      name: 'missing capture ID',
      page: { messages: [{ MessageID: matchingCapture.MessageID }], messages_count: 1 },
    },
    {
      name: 'non-string capture ID',
      page: { messages: [{ ...matchingCapture, ID: 7 }], messages_count: 1 },
    },
    {
      name: 'blank Message-ID',
      page: { messages: [{ ...matchingCapture, MessageID: ' ' }], messages_count: 1 },
    },
    {
      name: 'non-string Message-ID',
      page: { messages: [{ ...matchingCapture, MessageID: 7 }], messages_count: 1 },
    },
    { name: 'missing count', page: { messages: [matchingCapture] } },
    { name: 'nonnumeric count', page: { messages: [matchingCapture], messages_count: '1' } },
    { name: 'negative count', page: { messages: [matchingCapture], messages_count: -1 } },
    { name: 'fractional count', page: { messages: [matchingCapture], messages_count: 1.5 } },
    { name: 'count below page size', page: { messages: [matchingCapture], messages_count: 0 } },
  ])('refuses before SMTP on a successful lookup with $name', async ({ page }) => {
    const connect = connectSmtpPeer((socket) => socket.push('554 refused\r\n'));
    vi.stubGlobal('fetch', async () => Response.json(page));
    const error = await testDriver()
      .send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(SmsSendRefused);
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain(matchingCapture.ID);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects a subsequent page whose count falls below its offset and rows', async () => {
    const connect = connectSmtpPeer((socket) => socket.push('554 refused\r\n'));
    const lookups = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          messages: [{ ID: 'unrelated', MessageID: 'other-campaign-1@sms.dakly.test' }],
          messages_count: 2,
        }),
      )
      .mockResolvedValueOnce(Response.json({ messages: [matchingCapture], messages_count: 1 }));
    vi.stubGlobal('fetch', lookups);

    await expect(
      testDriver().send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
    ).rejects.toBeInstanceOf(SmsSendRefused);
    expect(lookups).toHaveBeenCalledTimes(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it('keeps the outcome unknown when the lookup after DATA returns a malformed page', async () => {
    smtpPeer((socket) => socket.push(null));
    const lookups = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }))
      .mockResolvedValueOnce(Response.json({ messages: [matchingCapture], messages_count: 0 }));
    vi.stubGlobal('fetch', lookups);

    const error = await testDriver()
      .send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' })
      .catch((error: unknown) => error);
    expect(error).not.toBeInstanceOf(SmsSendRefused);
    expect(error).toMatchObject({ code: 'SMS_SEND_FAILED', message: 'SMS delivery failed' });
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain(matchingCapture.ID);
    expect(lookups).toHaveBeenCalledTimes(2);
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
        Object.assign(new Error('SMTP refused after DATA'), {
          code: 'EMESSAGE',
          responseCode: 451,
          command: 'DATA',
        }),
      );
      const lookup = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }))
        .mockResolvedValueOnce(
          found
            ? Response.json({
                messages: [{ ID: 'first-capture', MessageID: 'campaign-451@sms.dakly.test' }],
                messages_count: 1,
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

  it.each([
    { code: 'ECONNECTION', command: 'EHLO', responseCode: 421 },
    { code: 'EENVELOPE', command: 'DATA', responseCode: 451 },
  ])('refuses a complete $command reply before sending the body', async (details) => {
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: 1,
      apiUrl: 'http://127.0.0.1:1',
    });
    vi.spyOn(driver['transport'], 'sendMail').mockRejectedValue(
      Object.assign(new Error('SMTP refused'), details),
    );
    await expect(driver.send({ to: '+8801700000000', text: 'SMS' })).rejects.toBeInstanceOf(
      SmsSendRefused,
    );
  });

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

  it.each([
    {
      name: 'truncated 451',
      finish: (socket: Duplex) => {
        socket.push('451 4.3');
        socket.push(null);
      },
    },
    {
      name: 'truncated 250',
      finish: (socket: Duplex) => {
        socket.push('250 queued');
        socket.push(null);
      },
    },
    { name: 'silent close', finish: (socket: Duplex) => socket.push(null) },
    { name: 'socket timeout', finish: (socket: Duplex) => socket.emit('timeout') },
    {
      name: 'read reset',
      finish: (socket: Duplex) =>
        socket.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET', syscall: 'read' })),
    },
    {
      name: 'write error',
      finish: (socket: Duplex) =>
        socket.destroy(Object.assign(new Error('pipe'), { code: 'EPIPE', syscall: 'write' })),
    },
  ])('recovers an exact capture after $name following DATA', async ({ finish }) => {
    smtpPeer(finish);
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }))
      .mockResolvedValueOnce(
        Response.json({
          messages: [
            { ID: 'other-capture', MessageID: 'other-campaign-1@sms.dakly.test' },
            { ID: 'first-capture', MessageID: 'campaign-1@sms.dakly.test' },
          ],
          messages_count: 2,
        }),
      );
    vi.stubGlobal('fetch', lookup);
    await expect(
      testDriver().send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
    ).resolves.toEqual({ providerMessageId: 'first-capture' });
    expect(lookup).toHaveBeenCalledTimes(2);
    const [url, options] = lookup.mock.calls[1]!;
    expect(new URL(url).searchParams.get('query')).toBe('message-id:"campaign-1@sms.dakly.test"');
    expect(options.method ?? 'GET').toBe('GET');
  });

  it.each([
    { name: 'truncated 451 with unavailable lookup', reply: '451 4.3', available: false },
    { name: 'silent close with only a substring match', reply: '', available: true },
  ])('reports an unknown outcome after a $name', async ({ reply, available }) => {
    smtpPeer((socket) => {
      if (reply) socket.push(reply);
      socket.push(null);
    });
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }))
      .mockResolvedValueOnce(
        available
          ? Response.json({
              messages: [{ ID: 'other-capture', MessageID: 'other-campaign-1@sms.dakly.test' }],
              messages_count: 1,
            })
          : new Response(null, { status: 503 }),
      );
    vi.stubGlobal('fetch', lookup);
    const error = await testDriver()
      .send({ to: '+8801700000000', text: 'secret-code', idempotencyKey: 'campaign-1' })
      .catch((error: unknown) => error);
    expect(error).not.toBeInstanceOf(SmsSendRefused);
    expect(error).toMatchObject({ code: 'SMS_SEND_FAILED', message: 'SMS delivery failed' });
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain('+8801700000000');
    expect(JSON.stringify(error)).not.toContain('secret-code');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('reports an unknown outcome, not a refusal, when the server stops answering after DATA', async () => {
    smtpPeer((socket) => socket.push(null));
    const lookup = vi.fn();
    vi.stubGlobal('fetch', lookup);
    const error = await testDriver()
      .send({ to: '+8801700000000', text: 'secret-code' })
      .catch((error: unknown) => error);
    expect(error).not.toBeInstanceOf(SmsSendRefused);
    expect(error).toMatchObject({ code: 'SMS_SEND_FAILED', message: 'SMS delivery failed' });
    expect(JSON.stringify(error)).not.toContain('+8801700000000');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses when the SMTP greeting times out before any submission', async () => {
    connectSmtpPeer(() => {});
    await expect(
      testDriver().send({ to: '+8801700000000', text: 'secret-code' }),
    ).rejects.toBeInstanceOf(SmsSendRefused);
  }, 15_000);

  it.each(['EHOSTUNREACH', 'ENETUNREACH'])('refuses after a %s connect error', async (code) => {
    vi.spyOn(net, 'connect').mockImplementation(() => {
      const socket = new Socket();
      const error = Object.assign(new Error('SMTP connect failed'), { code, syscall: 'connect' });
      setImmediate(() => socket.destroy(error));
      return socket;
    });
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }));
    vi.stubGlobal('fetch', lookup);
    await expect(
      testDriver().send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
    ).rejects.toBeInstanceOf(SmsSendRefused);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('refuses a complete post-DATA 550 without a second lookup', async () => {
    smtpPeer((socket) => socket.push('550 message rejected\r\n'));
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }));
    vi.stubGlobal('fetch', lookup);
    await expect(
      testDriver().send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
    ).rejects.toBeInstanceOf(SmsSendRefused);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('looks up an accepted submission without a queue id only once when the API fails', async () => {
    smtpPeer((socket) => socket.push('250 2.0.0 Ok: queued\r\n'));
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ messages: [], messages_count: 0 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', lookup);
    await expect(
      testDriver().send({ to: '+8801700000000', text: 'SMS', idempotencyKey: 'campaign-1' }),
    ).rejects.toMatchObject({ code: 'SMS_SEND_FAILED' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
