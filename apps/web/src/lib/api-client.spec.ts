import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiPost, apiRequest } from './api-client';

describe('apiPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends JSON and credentials through the same-origin API path', async () => {
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      request = { input, init };
      return Response.json({ id: 'customer-id' });
    });
    expect(await apiPost('/customers', { name: 'Rina' })).toEqual({ id: 'customer-id' });
    expect(request).toEqual({
      input: '/api/customers',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        signal: undefined,
        body: '{"name":"Rina"}',
      },
    });
  });

  it.each(['PATCH', 'DELETE'] as const)(
    'sends a scoped %s and keeps stale writes rejected',
    async (method) => {
      let sent: RequestInit | undefined;
      vi.stubGlobal('fetch', async (_url: string, options: RequestInit) => {
        sent = options;
        return Response.json(
          { error: { code: 'SESSION_CONTEXT_CHANGED', message: 'Refresh' } },
          { status: 409 },
        );
      });
      await expect(
        apiRequest('/members/member', {
          method,
          contextTag: 'old',
          body: method === 'PATCH' ? { builtInRole: 'admin' } : undefined,
        }),
      ).rejects.toMatchObject({ code: 'SESSION_CONTEXT_CHANGED' });
      expect(sent?.method).toBe(method);
      expect(sent?.headers).toMatchObject({ 'X-Session-Context': 'old' });
    },
  );

  it('does not advertise a JSON body on a bodyless device revocation', async () => {
    let sent: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_path: string, options: RequestInit) => {
      sent = options;
      return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
    });
    await apiRequest('/me/sessions/device', { method: 'DELETE', contextTag: 'verified' });
    expect(new Headers(sent?.headers).has('content-type')).toBe(false);
    expect(new Headers(sent?.headers).get('x-session-context')).toBe('verified');
    expect(sent?.body).toBeUndefined();
  });

  it('supports successful empty responses and passes the context precondition', async () => {
    let headers: HeadersInit | undefined;
    vi.stubGlobal('fetch', async (_path: string, options: RequestInit) => {
      headers = options.headers;
      return new Response(null, { status: 204, headers: { 'x-session-context': 'verified' } });
    });
    expect(await apiPost('/me/active-store', {}, { contextTag: 'verified' })).toBeUndefined();
    expect(headers).toMatchObject({ 'X-Session-Context': 'verified' });
  });

  it('rejects a response authorized under a different context', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ private: 'other shop' }, { headers: { 'x-session-context': 'different' } }),
    );
    await expect(apiRequest('/support-access', { contextTag: 'verified' })).rejects.toMatchObject({
      code: 'SESSION_CONTEXT_CHANGED',
    });
  });

  it('fails closed when the response context stamp is missing', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ private: 'unknown shop' }));
    await expect(apiRequest('/support-access', { contextTag: 'verified' })).rejects.toMatchObject({
      code: 'SESSION_CONTEXT_CHANGED',
    });
  });

  it('keeps validation fields on errors for the form', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request is not valid',
            fields: [{ path: 'phone', message: 'Enter a valid mobile number' }],
          },
        },
        { status: 400 },
      ),
    );
    await expect(apiPost('/customers', {})).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'phone', message: 'Enter a valid mobile number' }],
    });
  });

  it('exposes the unauthenticated API error to the browser', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        {
          error: {
            code: 'STORE_REQUIRED',
            message: 'Sign in to a store to continue',
          },
        },
        { status: 401 },
      ),
    );
    await expect(apiPost('/customers', {})).rejects.toMatchObject({
      code: 'STORE_REQUIRED',
      message: 'Sign in to a store to continue',
    });
  });
});
