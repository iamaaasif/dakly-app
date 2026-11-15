import { describe, expect, it } from 'vitest';
import { auditEntrySchema } from './audit';
import { accountSecurityEventSchema } from './account-security-events';

const id = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';

describe('audit metadata contracts', () => {
  it('accepts store ids and field names but rejects personal before and after values', () => {
    const entry = {
      actor: { kind: 'user', userId: id },
      action: 'member.updated',
      entityType: 'membership',
      entityId: id,
    };
    expect(
      auditEntrySchema.safeParse({ ...entry, after: { ids: [id], changedFields: ['phone'] } })
        .success,
    ).toBe(true);
    expect(auditEntrySchema.safeParse({ ...entry, after: { phone: '01712345678' } }).success).toBe(
      false,
    );
    expect(
      auditEntrySchema.safeParse({ ...entry, before: { ids: ['rina@example.test'] } }).success,
    ).toBe(false);
  });
  it('allows staff attribution with a fixed reason and ids only', () => {
    const entry = {
      event: 'recovery.completed',
      actor: { kind: 'staff', staffId: id, reasonType: 'lost_phone' },
      details: { recoveryId: id },
    };
    expect(accountSecurityEventSchema.safeParse(entry).success).toBe(true);
    expect(
      accountSecurityEventSchema.safeParse({ ...entry, details: { nid: '1234' } }).success,
    ).toBe(false);
    expect(
      accountSecurityEventSchema.safeParse({ ...entry, details: { recoveryId: '01712345678' } })
        .success,
    ).toBe(false);
    expect(
      accountSecurityEventSchema.safeParse({
        ...entry,
        actor: { ...entry.actor, reasonType: 'personal free text' },
      }).success,
    ).toBe(false);
  });
});
