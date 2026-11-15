import { describe, expect, it } from 'vitest';

import { inviteMemberSchema, memberListQuerySchema, memberRoleSchema } from './team';

describe('team membership input', () => {
  it('normalizes one recipient and rejects ambiguous or caller-selected stores', () => {
    expect(
      inviteMemberSchema.parse({ email: ' RINA@EXAMPLE.TEST ', builtInRole: 'admin' }),
    ).toEqual({ email: 'rina@example.test', builtInRole: 'admin' });
    for (const input of [
      { builtInRole: 'admin' },
      { phone: '01712345678', email: 'rina@example.test', builtInRole: 'admin' },
      { phone: '01712345678', builtInRole: 'admin', storeId: 'spoofed' },
    ])
      expect(inviteMemberSchema.safeParse(input).success).toBe(false);
  });
  it('requires exactly one built-in or custom role', () => {
    expect(
      memberRoleSchema.safeParse({
        builtInRole: 'admin',
        roleId: '019c01ea-cf15-7d31-a7f5-d73d66007ad7',
      }).success,
    ).toBe(false);
    expect(memberRoleSchema.safeParse({}).success).toBe(false);
  });
  it('bounds member lists and rejects malformed cursors', () => {
    expect(memberListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(memberListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(memberListQuerySchema.safeParse({ cursor: 'garbage' }).success).toBe(false);
  });
});
