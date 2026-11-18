import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, readJson } from './api-client';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends no Content-Type on a request without a body', async () => {
    let sent: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent = init;
      return Response.json({ ok: true });
    });
    await apiFetch('/api/admin/session');
    expect(sent?.method).toBe('GET');
    expect(new Headers(sent?.headers).has('content-type')).toBe(false);
  });

  it('sends the context header named by the caller', async () => {
    let sent: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent = init;
      return Response.json({});
    });
    await apiFetch('/support/api/customers', {
      body: { name: 'Rina' },
      context: { header: 'X-Support-Context', tag: 'tag' },
    });
    expect(new Headers(sent?.headers).get('x-support-context')).toBe('tag');
    expect(new Headers(sent?.headers).get('content-type')).toBe('application/json');
  });

  it('keeps the code and status from the standard error shape', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'STAFF_LOCKED', message: 'Locked' } }, { status: 403 }),
    );
    await expect(apiFetch('/api/admin/auth/sign-in', { body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      code: 'STAFF_LOCKED',
      message: 'Locked',
      status: 403,
    });
  });

  it('falls back to a generic error when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(apiFetch('/support/api/session')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'Could not complete the request. Try again.',
      status: 502,
    });
  });

  it('keeps the proxy status when JSON uses a different error shape', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'Forbidden' }, { status: 403 }));
    await expect(apiFetch('/api/orders', { body: {} })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'Could not complete the request. Try again.',
      status: 403,
    });
  });

  it('reads an empty response as undefined', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    expect(
      await readJson(await apiFetch('/api/admin/auth/sign-out', { body: {} })),
    ).toBeUndefined();
  });
});
