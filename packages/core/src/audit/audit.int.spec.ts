import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { stores } from '@dakly/db/schema/stores';
import { auditLog } from '@dakly/db/schema/platform';
import { TenantDatabase } from '../platform/database/tenant-database';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const app = createDatabase(process.env.DATABASE_URL!);
const database = new TenantDatabase(app.db);
const transaction = new StoreTransaction(database);
const audit = new AuditService(new AuditRepository(database));
const storeId = randomUUID();
const otherStoreId = randomUUID();
const entry = {
  actor: { kind: 'system' as const },
  action: 'store.changed',
  entityType: 'store',
  entityId: storeId,
  after: { changedFields: ['name'] },
};
beforeAll(() =>
  admin.db.insert(stores).values([
    { id: storeId, name: 'রিনা' },
    { id: otherStoreId, name: 'সুমি' },
  ]),
);
beforeEach(async () => {
  await admin.db.execute(sql`delete from audit_log where store_id = ${storeId}`);
  await admin.db.execute(sql`update stores set name = 'রিনা' where id = ${storeId}`);
});
afterAll(async () => {
  await admin.db.execute(
    sql`delete from audit_log where store_id in (${storeId}, ${otherStoreId})`,
  );
  await admin.db.execute(sql`delete from stores where id in (${storeId}, ${otherStoreId})`);
  await Promise.all([admin.pool.end(), app.pool.end()]);
});

describe('AuditService (Postgres)', () => {
  it('commits with the store change and hides its history from another store', async () => {
    await transaction.run(storeId, async () => {
      await database.forStore(storeId, (tx) =>
        tx.execute(sql`update stores set name = 'নতুন' where id = ${storeId}`),
      );
      await audit.record(storeId, entry);
    });
    expect(
      (await admin.db.execute(sql`select name from stores where id = ${storeId}`)).rows,
    ).toEqual([{ name: 'নতুন' }]);
    expect(
      await database.forStore(storeId, (tx) =>
        tx.select({ action: auditLog.action }).from(auditLog),
      ),
    ).toEqual([{ action: 'store.changed' }]);
    expect(
      await database.forStore(otherStoreId, (tx) => tx.select({ id: auditLog.id }).from(auditLog)),
    ).toEqual([]);
  });
  it('rolls back the change and event when the caller fails', async () => {
    await expect(
      transaction.run(storeId, async () => {
        await database.forStore(storeId, (tx) =>
          tx.execute(sql`update stores set name = 'rollback' where id = ${storeId}`),
        );
        await audit.record(storeId, { ...entry, action: 'store.rolled_back' });
        throw new Error('caller failed');
      }),
    ).rejects.toThrow('caller failed');
    expect(
      (await admin.db.execute(sql`select name from stores where id = ${storeId}`)).rows,
    ).toEqual([{ name: 'রিনা' }]);
    expect(
      (
        await admin.db.execute(
          sql`select id from audit_log where store_id = ${storeId} and action = 'store.rolled_back'`,
        )
      ).rows,
    ).toEqual([]);
  });
  it('rejects an event without the caller transaction', async () => {
    await expect(audit.record(storeId, entry)).rejects.toThrow(
      'requires an active store transaction',
    );
  });
  it('rolls back a change when the audit insert fails', async () => {
    await expect(
      transaction.run(storeId, async () => {
        await database.forStore(storeId, (tx) =>
          tx.execute(sql`update stores set name = 'unaudited' where id = ${storeId}`),
        );
        await audit.record(storeId, { ...entry, actor: { kind: 'user', userId: randomUUID() } });
      }),
    ).rejects.toThrow();
    expect(
      (await admin.db.execute(sql`select name from stores where id = ${storeId}`)).rows,
    ).toEqual([{ name: 'রিনা' }]);
  });
});
