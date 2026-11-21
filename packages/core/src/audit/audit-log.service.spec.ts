import { describe, expect, it } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';

import type { TeamService } from '../team/team.service';
import { AuditLogService } from './audit-log.service';
import type { AuditRepository } from './audit.repository';

type Row = Awaited<ReturnType<AuditRepository['list']>>[number];

function row(index: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `00000000-0000-7000-8000-00000000000${index}`,
    action: 'store.settings_changed',
    entityType: 'store',
    entityId: '00000000-0000-4000-8000-000000000001',
    after: { changedFields: ['name'] },
    actorType: 'user',
    actorUserId: 'owner',
    actorRole: 'owner',
    reason: null,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    ...overrides,
  };
}

function service(role: StoreAccess['role'] | null, rows: Row[]) {
  const repository = { list: async () => rows } as unknown as AuditRepository;
  const team = {
    accessFor: async () => (role ? { role } : undefined),
  } as unknown as TeamService;
  return new AuditLogService(repository, team);
}

describe('AuditLogService', () => {
  it('refuses anyone who is not the Owner', async () => {
    for (const role of ['admin', 'staff', null] as const)
      await expect(service(role, []).list('shop', 'user', { limit: 50 })).rejects.toMatchObject({
        code: 'AUDIT_LOG_DENIED',
      });
  });

  it('marks the caller, lists changed field names and pages with a cursor', async () => {
    const rows = [row(3), row(2, { actorUserId: 'other', actorRole: 'admin' }), row(1)];
    const page = await service('owner', rows).list('shop', 'owner', { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.actor).toEqual({ kind: 'user', isYou: true, role: 'owner' });
    expect(page.items[1]?.actor).toEqual({ kind: 'user', isYou: false, role: 'admin' });
    expect(page.items[0]?.changedFields).toEqual(['name']);
    expect(page.nextCursor).toBe(rows[1]?.id);
    const last = await service('owner', [row(1, { after: null })]).list('shop', 'owner', {
      limit: 2,
    });
    expect(last.nextCursor).toBeNull();
    expect(last.items[0]?.changedFields).toEqual([]);
  });
});
