import { describe, expect, it } from 'vitest';

import { staffRecoveryRequestSchema } from './staff-recovery';

const input = {
  targetId: '01900000-0000-7000-8000-000000000001',
  reasonType: 'lost_phone',
  reason: 'Verified identity by callback',
  checks: { nidLastFourMatched: true, storeDetailsMatched: true, oldNumberCallbackAttempted: true },
  removeTotp: true,
};
describe('staff recovery request', () => {
  it('records outcomes and rejects identity document values', () => {
    expect(staffRecoveryRequestSchema.safeParse(input).success).toBe(true);
    expect(
      staffRecoveryRequestSchema.safeParse({ ...input, checks: { ...input.checks, nid: '1234' } })
        .success,
    ).toBe(false);
    expect(
      staffRecoveryRequestSchema.safeParse({
        ...input,
        checks: { ...input.checks, nidLastFourMatched: false },
      }).success,
    ).toBe(false);
  });
  it('requires a reason and normalizes new contacts', () => {
    expect(staffRecoveryRequestSchema.safeParse({ ...input, reason: ' ' }).success).toBe(false);
    expect(
      staffRecoveryRequestSchema.parse({ ...input, newEmail: 'PERSON@example.test' }).newEmail,
    ).toBe('person@example.test');
  });
});
