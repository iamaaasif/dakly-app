import { createServer } from 'node:net';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { MailpitSmsDriver } from './mailpit-sms-driver';

describe('MailpitSmsDriver', () => {
  it('returns a safe failure without exposing the SMTP error or message', async () => {
    const server = createServer((socket) =>
      socket.end('554 rejected +8801700000000 secret-code\r\n'),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const driver = new MailpitSmsDriver({ host: '127.0.0.1', port: address.port });
    try {
      const error = await driver
        .send({ to: '+8801700000000', text: 'secret-code' })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ code: 'SMS_SEND_FAILED', message: 'SMS delivery failed' });
      expect(error).not.toHaveProperty('cause');
      expect(JSON.stringify(error)).not.toContain('+8801700000000');
      expect(JSON.stringify(error)).not.toContain('secret-code');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
