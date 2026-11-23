import { describe, expect, it, vi } from 'vitest';

import { FakeFacebookIdentityDriver } from '@dakly/providers/facebook/fake-facebook-identity-driver';

import type { FacebookStates } from './facebook-states';
import { FacebookService } from './facebook.service';

const request = { ip: '203.0.113.7' };
const profile = (extra: object = {}) =>
  `fake-facebook:${JSON.stringify({ id: '777', name: 'Rina', email: 'Rina@Example.com', ...extra })}`;

function setup(existing: { bySubject?: boolean; byEmail?: boolean } = {}) {
  const completeSignIn = vi.fn(async () => ({ token: 'session-token' }));
  const states = {
    issue: vi.fn(async () => 'nonce-1'),
    consume: vi.fn(async () => ({ termsVersion: '2026-11', isRemembered: true })),
  };
  const service = new FacebookService(
    { completeSignIn } as never,
    {
      findByFacebookSubject: async () => (existing.bySubject ? { id: 'u-subject' } : undefined),
      findByVerifiedEmail: async () => (existing.byEmail ? { id: 'u-email' } : undefined),
      allocateId: () => 'u-new',
    } as never,
    states as unknown as FacebookStates,
    { assertAllowed: async () => undefined, recordFailure: async () => undefined } as never,
    new FakeFacebookIdentityDriver('https://app.test/api/auth/facebook/callback'),
  );
  return { service, completeSignIn, states };
}
const finish = (service: FacebookService, code: string, cookieNonce?: string | null) =>
  service.finish(
    { code, state: 'n', cookieNonce: cookieNonce === null ? undefined : (cookieNonce ?? 'n') },
    request,
  );

describe('FacebookService', () => {
  it('signs in the account already linked to this Facebook id', async () => {
    const { service, completeSignIn } = setup({ bySubject: true });
    const result = await finish(service, profile());
    expect(result).toMatchObject({ token: 'session-token', isNewAccount: false });
    expect(completeSignIn.mock.calls[0]![0]).toMatchObject({
      id: 'u-subject',
      facebook: { mode: 'subject' },
    });
  });

  it('links an account that has the same verified email', async () => {
    const { service, completeSignIn } = setup({ byEmail: true });
    await finish(service, profile());
    expect(completeSignIn.mock.calls[0]![0]).toMatchObject({
      id: 'u-email',
      facebook: { mode: 'link', identity: { email: 'rina@example.com' } },
    });
  });

  it('creates an account with the Facebook email and name when the terms were accepted', async () => {
    const { service, completeSignIn } = setup();
    const result = await finish(service, profile());
    expect(result.isNewAccount).toBe(true);
    expect(completeSignIn.mock.calls[0]![0]).toMatchObject({
      id: 'u-new',
      registration: { name: 'Rina', email: 'rina@example.com', termsVersion: '2026-11' },
    });
  });

  it('refuses a new account when the person did not accept the terms', async () => {
    const { service, states } = setup();
    states.consume.mockResolvedValueOnce({ isRemembered: false } as never);
    await expect(finish(service, profile())).rejects.toMatchObject({ code: 'AUTH_TERMS_REQUIRED' });
  });

  it('asks for another sign-up method when Facebook shares no email', async () => {
    const { service } = setup();
    await expect(finish(service, profile({ email: undefined }))).rejects.toMatchObject({
      code: 'AUTH_FACEBOOK_EMAIL_REQUIRED',
    });
  });

  it('rejects a return that did not start in this browser', async () => {
    const { service, completeSignIn } = setup({ bySubject: true });
    await expect(finish(service, profile(), null)).rejects.toMatchObject({
      code: 'AUTH_FACEBOOK_STATE_INVALID',
    });
    await expect(finish(service, profile(), 'other')).rejects.toMatchObject({
      code: 'AUTH_FACEBOOK_STATE_INVALID',
    });
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it('rejects a code Facebook does not accept', async () => {
    const { service } = setup();
    await expect(finish(service, 'bad')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
  });
});
