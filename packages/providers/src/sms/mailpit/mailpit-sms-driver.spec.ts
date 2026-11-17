import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';

import { describe, expect, it } from 'vitest';

import { SmsSendRefused } from '../sms-driver';
import { MailpitSmsDriver } from './mailpit-sms-driver';

describe('MailpitSmsDriver', () => {
  it('refuses on a permanent SMTP answer without exposing the error or message', async () => {
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
