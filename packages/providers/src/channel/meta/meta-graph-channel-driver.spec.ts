import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetaGraphChannelDriver } from './meta-graph-channel-driver';

const driver = new MetaGraphChannelDriver({
  appId: '123456',
  appSecret: 'test-app-secret',
  loginConfigId: '789012',
  redirectUri: 'https://shop.example.test/integrations/meta',
});

describe('MetaGraphChannelDriver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens Facebook Login for Business with a server-selected redirect and state', () => {
    const url = new URL(driver.authorizationUrl('login-state'));
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '123456',
      config_id: '789012',
      redirect_uri: 'https://shop.example.test/integrations/meta',
      response_type: 'code',
      state: 'login-state',
    });
  });

  it('exchanges the authorization code and uses the long-lived user credential to list linked accounts', async () => {
    const requests: { url: URL; authorization: string | null }[] = [];
    const responses = [
      { access_token: 'test-short-user-credential' },
      { access_token: 'test-long-user-credential' },
      {
        data: [
          {
            id: '123',
            name: 'রিনার দোকান',
            access_token: 'test-page-credential',
            tasks: ['MANAGE', 'MESSAGING'],
            instagram_business_account: { id: '789', username: 'rinas_shop' },
          },
        ],
        paging: { next: 'https://untrusted.example.test/path', cursors: { after: 'page-cursor' } },
      },
      {
        data: [
          {
            id: '456',
            name: 'Karim Shop',
            access_token: 'other-test-page-credential',
            tasks: ['MANAGE'],
          },
        ],
      },
    ];
    vi.stubGlobal('fetch', async (endpoint: URL, init: RequestInit) => {
      requests.push({
        url: new URL(endpoint),
        authorization: new Headers(init.headers).get('authorization'),
      });
      return Response.json(responses.shift());
    });

    const credential = await driver.exchangeAuthorizationCode('authorization-code');
    expect(await driver.listAccounts(credential)).toEqual([
      {
        id: '123',
        name: 'রিনার দোকান',
        accessToken: 'test-page-credential',
        instagram: { id: '789', name: 'rinas_shop' },
      },
      {
        id: '456',
        name: 'Karim Shop',
        accessToken: 'other-test-page-credential',
        instagram: null,
      },
    ]);
    expect(requests.map(({ url }) => url.hostname)).toEqual(Array(4).fill('graph.facebook.com'));
    expect(requests[0]?.url.searchParams.get('code')).toBe('authorization-code');
    expect(requests[1]?.url.searchParams.get('fb_exchange_token')).toBe(
      'test-short-user-credential',
    );
    expect(requests[2]?.authorization).toBe('Bearer test-long-user-credential');
    expect(requests[3]?.url.searchParams.get('after')).toBe('page-cursor');
  });

  it('shares one deadline across pages with distinct cursors', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal);
    vi.stubGlobal('fetch', async (endpoint: URL, init: RequestInit) => {
      const after = endpoint.searchParams.get('after');
      if (init.signal?.aborted) throw new DOMException('Request timed out', 'TimeoutError');
      if (after === 'second') return Response.json({ data: [] });
      if (after === 'first') deadline.abort();
      return Response.json({
        data: [],
        paging: {
          next: 'https://graph.facebook.com/next',
          cursors: { after: after ? 'second' : 'first' },
        },
      });
    });

    await expect(driver.listAccounts('test-user-credential')).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('returns a typed failure without the vendor error text', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 190, message: 'private token details' } }, { status: 400 }),
    );
    await expect(driver.exchangeAuthorizationCode('old-code')).rejects.toMatchObject({
      code: 'auth_error',
      message: 'Meta request failed',
    });
  });
});
