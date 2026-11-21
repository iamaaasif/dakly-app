import { describe, expect, it } from 'vitest';

import { TurnstileDriver } from './turnstile-driver';

const answer = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe('TurnstileDriver', () => {
  it('passes when Cloudflare says success', async () => {
    const driver = new TurnstileDriver('site', 'secret', answer({ success: true }));
    expect(await driver.verify('token', '203.0.113.7')).toBe(true);
  });

  it('fails when Cloudflare rejects the token', async () => {
    const driver = new TurnstileDriver('site', 'secret', answer({ success: false }));
    expect(await driver.verify('token', '203.0.113.7')).toBe(false);
  });

  it('fails on a server error or an unreadable answer', async () => {
    expect(await new TurnstileDriver('s', 'k', answer({}, 500)).verify('t', 'ip')).toBe(false);
    expect(await new TurnstileDriver('s', 'k', answer('x')).verify('t', 'ip')).toBe(false);
  });

  it('fails when the call throws', async () => {
    const driver = new TurnstileDriver('s', 'k', (async () => {
      throw new Error('offline');
    }) as typeof fetch);
    expect(await driver.verify('t', 'ip')).toBe(false);
  });
});
