import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireStaff } from './require-staff';

vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      cookie: 'dakly_staff=fixture',
      'cf-access-jwt-assertion': 'signed-fixture',
      'x-forwarded-for': '203.0.113.7, 10.42.0.5',
    }),
}));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('Redirected to sign-in');
  },
}));
afterEach(() => vi.unstubAllEnvs());
describe('Server-rendered staff session lookup', () => {
  it('sends external identity through trusted proxy headers to a distinct API hostname', async () => {
    const server = createServer((request, response) => {
      const valid =
        request.url === '/admin/auth/session' &&
        request.headers['x-forwarded-host'] === 'admin.example.test' &&
        request.headers['x-forwarded-proto'] === 'https' &&
        request.headers['x-forwarded-for'] === '203.0.113.7, 10.42.0.5' &&
        request.headers.cookie === 'dakly_staff=fixture' &&
        request.headers['cf-access-jwt-assertion'] === 'signed-fixture';
      response.writeHead(valid ? 200 : 403);
      response.end(
        JSON.stringify({ id: 'fixture-id', name: 'Staff fixture', role: 'super_admin' }),
      );
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    vi.stubEnv('ADMIN_ORIGIN', 'https://admin.example.test');
    vi.stubEnv('ADMIN_API_URL', `http://127.0.0.1:${address.port}`);
    vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly.cloudflareaccess.com');
    vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
    try {
      await expect(requireStaff()).resolves.toMatchObject({ role: 'super_admin' });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
