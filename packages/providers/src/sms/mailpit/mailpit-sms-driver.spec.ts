import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer, type Server, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { SmsSendRefused } from '../sms-driver';
import { MailpitSmsDriver } from './mailpit-sms-driver';

const host = '127.0.0.1';
const message = { to: '+8801700000000', text: 'secret-code', idempotencyKey: 'operation' };
const messageId = `${message.idempotencyKey}@sms.dakly.test`;
const servers: Server[] = [];
const sockets = new Set<Socket>();

async function listen(server: Server): Promise<number> {
  servers.push(server);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.listen(0, host);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  return address.port;
}

async function smtpPeer({
  greeting = '220 test SMTP',
  dataReply = '354 send body',
  finish = (socket: Socket) => socket.write('250 queued as capture-one\r\n'),
}: { greeting?: string; dataReply?: string; finish?: (socket: Socket) => void } = {}) {
  let connections = 0;
  let submissions = 0;
  const port = await listen(
    createServer((socket) => {
      connections += 1;
      socket.setEncoding('utf8');
      socket.write(`${greeting}\r\n`);
      let buffer = '';
      let body = false;
      socket.on('data', (chunk: string) => {
        const lines = (buffer + chunk).split('\r\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (body) {
            if (line === '.') {
              submissions += 1;
              body = false;
              finish(socket);
            }
          } else if (line === 'DATA') {
            socket.write(`${dataReply}\r\n`);
            body = dataReply.startsWith('354');
          } else if (line === 'QUIT') {
            socket.end('221 bye\r\n');
          } else {
            socket.write('250 accepted\r\n');
          }
        }
      });
    }),
  );
  return { port, connections: () => connections, submissions: () => submissions };
}

async function searchPeer(response: () => { status?: number; body: unknown }) {
  const queries: URLSearchParams[] = [];
  const port = await listen(
    createHttpServer((request, reply) => {
      queries.push(new URL(request.url ?? '/', `http://${host}`).searchParams);
      const { status = 200, body } = response();
      reply.writeHead(status, { 'Content-Type': 'application/json' });
      reply.end(JSON.stringify(body));
    }),
  );
  return { apiUrl: `http://${host}:${port}`, queries };
}

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe('MailpitSmsDriver', () => {
  it.each([
    { label: 'lookup is down', status: 503, body: {} },
    {
      label: 'capture fields are malformed',
      body: { messages: [{ ID: '', MessageID: messageId }] },
    },
  ])('refuses before connecting to SMTP when $label', async ({ status, body }) => {
    const smtp = await smtpPeer();
    const { apiUrl } = await searchPeer(() => ({ ...(status && { status }), body }));
    const driver = new MailpitSmsDriver({ host, port: smtp.port, apiUrl });

    await expect(driver.send(message)).rejects.toBeInstanceOf(SmsSendRefused);
    expect(smtp.connections()).toBe(0);
  });

  it.each([
    { label: 'greeting', greeting: `554 rejected ${message.to} ${message.text}` },
    { label: 'DATA command', dataReply: `550 rejected ${message.to} ${message.text}` },
  ])('refuses a complete 5xx reply to the $label before submission', async (refusal) => {
    const smtp = await smtpPeer(refusal);
    const driver = new MailpitSmsDriver({ host, port: smtp.port, apiUrl: `http://${host}:1` });
    const { to, text } = message;

    const error: unknown = await driver.send({ to, text }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SmsSendRefused);
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain(to);
    expect(JSON.stringify(error)).not.toContain(text);
    expect(smtp.submissions()).toBe(0);
  });

  it.each([undefined, new AbortController().signal])(
    'refuses a TCP connection that never opens, with signal %s',
    async (signal) => {
      const server = createServer();
      const port = await listen(server);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const driver = new MailpitSmsDriver({ host, port, apiUrl: `http://${host}:1` });
      const { to, text } = message;

      await expect(driver.send({ to, text }, signal)).rejects.toBeInstanceOf(SmsSendRefused);
    },
  );

  it.each([
    { label: 'drops the connection', finish: (socket: Socket) => socket.destroy() },
    { label: 'returns a final 550', finish: (socket: Socket) => socket.end('550 rejected\r\n') },
  ])(
    'keeps the outcome unknown when SMTP $label after DATA without a capture',
    async ({ finish }) => {
      const smtp = await smtpPeer({ finish });
      const { apiUrl, queries } = await searchPeer(() => ({
        body: { messages: [], messages_count: 0 },
      }));
      const driver = new MailpitSmsDriver({ host, port: smtp.port, apiUrl });

      const error: unknown = await driver.send(message).catch((reason: unknown) => reason);

      expect(error).toMatchObject({ code: 'SMS_SEND_FAILED', message: 'SMS delivery failed' });
      expect(error).not.toBeInstanceOf(SmsSendRefused);
      expect(error).not.toHaveProperty('cause');
      expect(JSON.stringify(error)).not.toContain(message.to);
      expect(JSON.stringify(error)).not.toContain(message.text);
      expect(smtp.submissions()).toBe(1);
      expect(queries).toHaveLength(2);
    },
  );

  it('finds the exact capture after a lost reply and returns it on a same-key retry', async () => {
    const smtp = await smtpPeer({ finish: (socket) => socket.destroy() });
    const substring = { ID: 'unrelated', MessageID: `other-${messageId}` };
    const capture = { ID: 'capture-one', MessageID: messageId };
    const { apiUrl, queries } = await searchPeer(() => ({
      body: { messages: smtp.submissions() ? [substring, capture] : [substring] },
    }));
    const driver = new MailpitSmsDriver({ host, port: smtp.port, apiUrl });

    const receipt = await driver.send(message);
    expect(receipt).toEqual({ providerMessageId: 'capture-one' });
    expect(await driver.send(message)).toEqual(receipt);
    expect(smtp.submissions()).toBe(1);
    expect(queries.map((query) => [...query.entries()])).toEqual(
      Array.from({ length: 3 }, () => [
        ['query', `message-id:"${messageId}"`],
        ['limit', '100'],
      ]),
    );
  });

  it('closes the SMTP connection when the delivery is aborted', async () => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const driver = new MailpitSmsDriver({
      host: '127.0.0.1',
      port: address.port,
      apiUrl: 'http://127.0.0.1:1',
    });
    const controller = new AbortController();
    const connected = once(server, 'connection') as Promise<[Socket]>;
    const sent = driver
      .send({ to: '01712345678', text: 'Private order update' }, controller.signal)
      .catch((error: unknown) => error);
    const [socket] = await connected;
    socket.resume();
    try {
      const closed = once(socket, 'close', { signal: AbortSignal.timeout(500) });
      controller.abort();
      await closed;
      expect(await sent).toMatchObject({ code: 'SMS_SEND_TIMEOUT' });
    } finally {
      socket.destroy();
      server.close();
      await once(server, 'close');
      await sent;
    }
  });

  it('returns a safe failure without exposing the SMTP error or message', async () => {
    const server = createServer((socket) =>
      socket.end('554 rejected +8801700000000 secret-code\r\n'),
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
});
