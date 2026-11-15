import { describe, it, expect } from 'vitest';

import { staffAuditSearchSchema } from './staff-audit';
import { supportRequestSchema } from './support';

const request = {
  targetId: '019a7bd8-845e-7000-8000-000000000001',
  reason: 'Customer support issue',
  access: 'read',
  scopes: ['customers'],
  durationMinutes: 30,
};
describe('support request limits', () => {
  it('accepts exactly the bounded supported capabilities and durations', () => {
    for (const durationMinutes of [30, 1440])
      expect(supportRequestSchema.safeParse({ ...request, durationMinutes }).success).toBe(true);
    for (const durationMinutes of [29, 1441, 30.5])
      expect(supportRequestSchema.safeParse({ ...request, durationMinutes }).success).toBe(false);
  });
  it('rejects short reasons, extra scope and store field injection', () => {
    for (const change of [
      { reason: 'too short' },
      { scopes: ['billing'] },
      { scopes: [] },
      { scopes: ['customers', 'customers'] },
      { storeId: request.targetId },
    ])
      expect(supportRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
  });
});

it('validates both audit cursor fields while preserving PostgreSQL microseconds', () => {
  const id = '019a7bd8-845e-7000-8000-000000000001';
  expect(
    staffAuditSearchSchema.safeParse({ cursor: `2026-11-14T12:00:00.123456Z|${id}` }).success,
  ).toBe(true);
  for (const cursor of [
    `2026-99-99T12:00:00Z|${id}`,
    `2026-11-14T12:00:00Z|${'-'.repeat(36)}`,
    `2026-11-14T12:00:00Z|${id}|extra`,
  ])
    expect(staffAuditSearchSchema.safeParse({ cursor }).success).toBe(false);
});
