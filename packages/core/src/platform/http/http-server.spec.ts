import { afterEach, describe, expect, it } from 'vitest';

import { createHttpServer } from './http-server';

const servers: ReturnType<typeof createHttpServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
function fixture(trusted = ['10.42.0.0/24', '127.0.0.1', '::1']) {
  const server = createHttpServer(trusted);
  servers.push(server);
  server.get('/', (request) => ({
    ip: request.ip,
    hostname: request.hostname,
    protocol: request.protocol,
    forwarded: request.headers['x-forwarded-for'],
  }));
  return server;
}
const headers = {
  host: 'backend.internal:4000',
  'x-forwarded-host': 'admin.example.test',
  'x-forwarded-for': '203.0.113.7, 10.42.0.2',
  'x-forwarded-proto': 'https',
};
describe('API forwarding boundary', () => {
  it('resolves the external host, protocol and client through explicit trusted hops', async () => {
    const response = await fixture().inject({ url: '/', remoteAddress: '10.42.0.3', headers });
    expect(response.json()).toMatchObject({
      hostname: 'admin.example.test',
      ip: '203.0.113.7',
      protocol: 'https',
    });
  });
  it('normalizes a single forwarded host and accepts its default port', async () => {
    const response = await fixture().inject({
      url: '/',
      remoteAddress: '127.0.0.1',
      headers: { ...headers, 'x-forwarded-host': 'ADMIN.EXAMPLE.TEST:443' },
    });
    expect(response.json().hostname).toBe('admin.example.test');
  });
  it('stops at the first untrusted hop instead of a forged leftmost address', async () => {
    const response = await fixture().inject({
      url: '/',
      remoteAddress: '10.42.0.3',
      headers: {
        ...headers,
        'x-forwarded-for': '198.51.100.99, 203.0.113.7, 10.42.0.2',
      },
    });
    expect(response.json().ip).toBe('203.0.113.7');
  });
  it.each(['203.0.113.20', '127.0.0.2', '::ffff:127.0.0.2'])(
    'ignores all forged forwarding headers from untrusted peer %s',
    async (peer) => {
      const response = await fixture().inject({ url: '/', remoteAddress: peer, headers });
      expect(response.json()).toEqual({ hostname: 'backend.internal', ip: peer, protocol: 'http' });
    },
  );
  it('trusts no peer when unconfigured', async () => {
    const response = await fixture([]).inject({ url: '/', remoteAddress: '127.0.0.1', headers });
    expect(response.json()).toEqual({
      hostname: 'backend.internal',
      ip: '127.0.0.1',
      protocol: 'http',
    });
  });
  it('handles IPv4 mapped IPv6 peers with the same trust policy', async () => {
    const response = await fixture().inject({
      url: '/',
      remoteAddress: '::ffff:127.0.0.1',
      headers,
    });
    expect(response.json().ip).toBe('203.0.113.7');
  });
  it.each([
    { 'x-forwarded-host': 'evil.test, admin.example.test' },
    { 'x-forwarded-host': 'https://admin.example.test/path' },
    { 'x-forwarded-proto': 'https,http' },
    { 'x-forwarded-for': 'not-an-ip' },
    { 'x-forwarded-for': '203.0.113.1,'.repeat(17) + '203.0.113.1' },
  ])('rejects malformed trusted forwarding metadata: %j', async (invalid) => {
    const response = await fixture().inject({
      url: '/',
      remoteAddress: '127.0.0.1',
      headers: { ...headers, ...invalid },
    });
    expect(response.statusCode).toBe(400);
  });
  it('preserves direct requests without forwarding headers', async () => {
    const response = await fixture().inject({
      url: '/',
      remoteAddress: '127.0.0.1',
      headers: { host: 'api.example.test' },
    });
    expect(response.json()).toEqual({
      hostname: 'api.example.test',
      ip: '127.0.0.1',
      protocol: 'http',
    });
  });
});
