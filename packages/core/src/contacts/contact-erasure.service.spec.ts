import { describe, expect, it } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';

import type { AuditService } from '../audit/audit.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { TeamService } from '../team/team.service';
import type { ContactErasureRepository } from './contact-erasure.repository';
import { ContactErasureService } from './contact-erasure.service';

const actor = { kind: 'user', userId: 'user' } as const;
const owner = { role: 'owner' } as StoreAccess;
const admin = { role: 'admin' } as StoreAccess;

function service(found: boolean) {
  const events: unknown[] = [];
  const audits: unknown[] = [];
  const instance = new ContactErasureService(
    {
      erase: async () => ({ found, conversationIds: ['c1', 'c2'], attachmentKeys: ['k'] }),
      dueDeleted: async () => [{ storeId: 's', contactId: 'c' }],
    } as unknown as ContactErasureRepository,
    { run: (_store: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
    { record: async (_store: string, entry: unknown) => void audits.push(entry) } as AuditService,
    { publishAll: async (list: unknown[]) => void events.push(...list) } as OutboxService,
    { now: () => new Date('2026-11-21T00:00:00Z') } as Clock,
    { canEraseCustomers: (access: StoreAccess) => access.role === 'owner' } as TeamService,
  );
  return { instance, events, audits };
}

describe('ContactErasureService', () => {
  it('lets only the owner erase', async () => {
    const { instance, events } = service(true);
    await expect(instance.erase('s', 'c', admin, actor)).rejects.toMatchObject({
      code: 'CONTACT_ERASE_NOT_ALLOWED',
    });
    expect(events).toEqual([]);
  });

  it('reports a missing contact', async () => {
    await expect(service(false).instance.erase('s', 'c', owner, actor)).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
    });
  });

  it('records the erasure by id and tells derived data to clean up', async () => {
    const { instance, events, audits } = service(true);
    await instance.erase('s', 'c', owner, actor);
    expect(audits).toMatchObject([{ action: 'contacts.erased', entityId: 'c' }]);
    expect(events).toMatchObject([
      { type: 'contact.deleted', payload: { contactId: 'c' } },
      {
        type: 'contact.erased',
        payload: { contactId: 'c', conversationIds: ['c1', 'c2'], attachmentKeys: ['k'] },
      },
    ]);
  });

  it('erases the deleted customers that are due, as the system', async () => {
    const { instance, audits } = service(true);
    expect(await instance.eraseDeletedCustomers()).toBe(1);
    expect(audits).toMatchObject([{ actor: { kind: 'system' }, action: 'contacts.erased' }]);
  });
});
