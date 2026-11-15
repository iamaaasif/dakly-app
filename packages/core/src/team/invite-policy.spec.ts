import { describe, expect, it } from 'vitest';

import { assertInviteRecipient, assertOpenInvite } from './invite-policy';

const now = new Date('2026-11-14T00:00:00Z');
const identity = {
  phone: '01712345678',
  phoneVerifiedAt: now,
  email: 'rina@example.test',
  emailVerifiedAt: now,
};
describe('invitation acceptance policy', () => {
  it.each(['removed', 'active'])('rejects %s invitations', (status) => {
    expect(() =>
      assertOpenInvite({ status, inviteExpiresAt: new Date(now.getTime() + 1) }, now),
    ).toThrow(expect.objectContaining({ code: 'INVITE_INVALID' }));
  });
  it('rejects missing and expired invitations including the exact expiry', () => {
    for (const invite of [
      undefined,
      { status: 'invited', inviteExpiresAt: now },
      { status: 'invited', inviteExpiresAt: null },
    ])
      expect(() => assertOpenInvite(invite, now)).toThrow(
        expect.objectContaining({ code: 'INVITE_INVALID' }),
      );
  });
  it('requires a matching currently verified recipient', () => {
    expect(() =>
      assertInviteRecipient({ invitePhone: identity.phone, inviteEmail: null }, identity),
    ).not.toThrow();
    expect(() =>
      assertInviteRecipient({ invitePhone: null, inviteEmail: identity.email }, identity),
    ).not.toThrow();
    expect(() =>
      assertInviteRecipient(
        { invitePhone: null, inviteEmail: identity.email },
        { ...identity, email: 'RINA@EXAMPLE.TEST' },
      ),
    ).not.toThrow();
    for (const account of [
      undefined,
      { ...identity, phoneVerifiedAt: null },
      { ...identity, phone: '01812345678' },
    ])
      expect(() =>
        assertInviteRecipient({ invitePhone: identity.phone, inviteEmail: null }, account),
      ).toThrow(expect.objectContaining({ code: 'INVITE_WRONG_ACCOUNT' }));
    expect(() =>
      assertInviteRecipient(
        { invitePhone: null, inviteEmail: identity.email },
        { ...identity, emailVerifiedAt: null },
      ),
    ).toThrow(expect.objectContaining({ code: 'INVITE_WRONG_ACCOUNT' }));
  });
});
