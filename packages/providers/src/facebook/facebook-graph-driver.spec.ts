import { describe, expect, it } from 'vitest';

import { FacebookGraphDriver } from './facebook-graph-driver';

const config = { appId: '123', appSecret: 'secret', redirectUri: 'https://app.test/cb' };
function replying(...bodies: Array<{ status?: number; body: unknown }>) {
  const urls: string[] = [];
  const fetcher = (async (url: string) => {
    urls.push(url);
    const next = bodies.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetcher, urls };
}

describe('FacebookGraphDriver', () => {
  it('sends the browser to Facebook with the state and the email scope', () => {
    const url = new URL(new FacebookGraphDriver(config).authorizeUrl('abc'));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('scope')).toBe('public_profile,email');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
  });

  it('turns a code into the person id, name and lower-cased email', async () => {
    const { fetcher, urls } = replying(
      { body: { access_token: 'tok' } },
      { body: { id: '42', name: ' Rina ', email: 'Rina@Example.com' } },
    );
    await expect(new FacebookGraphDriver(config, fetcher).identify('code')).resolves.toEqual({
      subject: '42',
      name: 'Rina',
      email: 'rina@example.com',
    });
    expect(urls[1]).toContain('appsecret_proof=');
  });

  it('returns no email when the person shared none', async () => {
    const { fetcher } = replying({ body: { access_token: 'tok' } }, { body: { id: '42' } });
    expect((await new FacebookGraphDriver(config, fetcher).identify('code')).email).toBeUndefined();
  });

  it('rejects a code Facebook refuses and reports an outage separately', async () => {
    await expect(
      new FacebookGraphDriver(config, replying({ status: 400, body: {} }).fetcher).identify('x'),
    ).rejects.toMatchObject({ code: 'FACEBOOK_IDENTITY_INVALID' });
    await expect(
      new FacebookGraphDriver(config, replying({ status: 500, body: {} }).fetcher).identify('x'),
    ).rejects.toMatchObject({ code: 'FACEBOOK_IDENTITY_UNAVAILABLE' });
  });

  it('rejects a profile without a numeric id', async () => {
    const { fetcher } = replying({ body: { access_token: 'tok' } }, { body: { id: 'abc' } });
    await expect(new FacebookGraphDriver(config, fetcher).identify('x')).rejects.toMatchObject({
      code: 'FACEBOOK_IDENTITY_INVALID',
    });
  });
});
