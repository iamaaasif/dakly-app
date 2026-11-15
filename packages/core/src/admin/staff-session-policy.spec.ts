import { describe, expect, it } from 'vitest';
import { isStaffSessionCurrent } from './staff-session-policy';

describe('isStaffSessionCurrent', () => {
  it('expires exactly at thirty minutes of inactivity', () => {
    const session = {
      revokedAt: null,
      expiresAt: new Date('2026-11-15T08:00:00Z'),
      lastSeenAt: new Date('2026-11-15T00:00:00Z'),
    };
    expect(isStaffSessionCurrent(session, new Date('2026-11-15T00:29:59.999Z'))).toBe(true);
    expect(isStaffSessionCurrent(session, new Date('2026-11-15T00:30:00Z'))).toBe(false);
    expect(isStaffSessionCurrent({ ...session, lastSeenAt: null }, session.lastSeenAt)).toBe(false);
    expect(
      isStaffSessionCurrent({ ...session, revokedAt: session.lastSeenAt }, session.lastSeenAt),
    ).toBe(false);
    expect(isStaffSessionCurrent(session, session.expiresAt)).toBe(false);
  });
});
