import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import type { FileStorageDriver } from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import type { StoresService } from '../stores/stores.service';
import { AuditArchiveRepository } from './audit-archive.repository';
import { AuditArchiveService, auditArchiveKey } from './audit-archive.service';

// A month older than 24 months, so no other test or real data shares it.
const MONTH = '2015-06-01';
const PARTITION = 'audit_log_y2015m06';

class MemoryStorage {
  readonly objects = new Map<string, Uint8Array>();
  failWrites = false;

  async writeBytes(key: string, body: Uint8Array) {
    if (this.failWrites) throw new Error('R2 is down');
    this.objects.set(key, body);
  }

  async getObjectMetadata(key: string) {
    const body = this.objects.get(key);
    return body ? { contentType: 'application/gzip', sizeBytes: body.byteLength } : null;
  }
}

describe('audit archive (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  const storage = new MemoryStorage();
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new AuditArchiveRepository(app.db, new TenantDatabase(app.db));
  const stores = {
    maintenanceStoreIds: async (after: string | null) =>
      after === null ? [fixture.a, fixture.b] : [],
  } as StoresService;
  const service = new AuditArchiveService(
    repository,
    stores,
    storage as unknown as FileStorageDriver,
  );

  const partitionExists = async () =>
    (await owner.query('select to_regclass($1) as found', [`public.${PARTITION}`])).rows[0]
      .found !== null;
  const insertAudit = (storeId: string, at: string, action: string) =>
    owner.query(
      `insert into audit_log (id, store_id, actor_type, action, entity_type, created_at)
       values ($1, $2, 'system', $3, 'store', $4)`,
      [randomUUID(), storeId, action, at],
    );

  beforeAll(async () => {
    await fixture.setup();
    await owner.query(
      `create table ${PARTITION} partition of audit_log
       for values from ('2015-06-01 00:00:00+00') to ('2015-07-01 00:00:00+00')`,
    );
    await insertAudit(fixture.a, '2015-06-02T10:00:00Z', 'first');
    await insertAudit(fixture.a, '2015-06-03T10:00:00Z', 'second');
    await insertAudit(fixture.b, '2015-06-04T10:00:00Z', 'other');
  });

  afterAll(async () => {
    await app.pool.end();
    await owner.query(`drop table if exists ${PARTITION}`);
    await fixture.close();
  });

  it('reads a store month in ordered pages', async () => {
    const first = await repository.storeRowsPage(fixture.a, MONTH, null, 1);
    expect(first.lines).toHaveLength(1);
    expect(first.next).not.toBeNull();
    const second = await repository.storeRowsPage(fixture.a, MONTH, first.next, 1);
    expect(JSON.parse(second.lines[0]!).action).toBe('second');
    expect(second.next).not.toBeNull();
    expect((await repository.storeRowsPage(fixture.a, MONTH, second.next, 1)).lines).toEqual([]);
    expect((await repository.storeRowsPage(fixture.b, MONTH, null, 5)).lines).toHaveLength(1);
  });

  it('refuses to drop a month when the exported count is wrong or the month is recent', async () => {
    await expect(repository.dropMonth(MONTH, 2)).rejects.toMatchObject({
      code: 'MAINTENANCE_ARCHIVE_COUNT_CHANGED',
    });
    expect(await partitionExists()).toBe(true);
    await expect(
      app.db.execute(sql`select drop_audit_month(date_trunc('month', now())::date, 0)`),
    ).rejects.toThrow();
  });

  it('keeps the month when R2 fails, then archives every store and drops it on the rerun', async () => {
    storage.failWrites = true;
    await expect(service.archiveExpiredMonths()).rejects.toThrow('R2 is down');
    expect(await partitionExists()).toBe(true);

    storage.failWrites = false;
    await service.archiveExpiredMonths();

    expect(await partitionExists()).toBe(false);
    const lines = (storeId: string) =>
      gunzipSync(storage.objects.get(auditArchiveKey(storeId, MONTH))!)
        .toString()
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    expect(lines(fixture.a).map((row) => row.action)).toEqual(['first', 'second']);
    expect(lines(fixture.b).map((row) => row.action)).toEqual(['other']);
    expect(lines(fixture.b)[0]).toMatchObject({ store_id: fixture.b });
  });

  it('has nothing to do once the month is gone', async () => {
    await expect(service.archiveExpiredMonths()).resolves.toBeUndefined();
  });
});
