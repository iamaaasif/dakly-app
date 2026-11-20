import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  FileStorageDriver,
  ListedObject,
} from '@dakly/providers/file-storage/file-storage-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { Clock } from '../platform/clock';
import type { StoresService } from '../stores/stores.service';
import { FILE_REFERENCES, FilePurgeRepository } from './file-purge.repository';
import { FilePurgeService } from './file-purge.service';

const NOW = new Date('2026-11-20T00:00:00Z');
const HOUR = 3_600_000;

class MemoryStorage {
  readonly objects = new Map<string, Date>();
  readonly deleted: string[] = [];

  async deleteObject(key: string) {
    this.deleted.push(key);
    this.objects.delete(key);
  }

  // Two objects per page, and the token is the last key like a real continuation token, so the
  // deletes made while paging do not move the next page.
  async listObjects(prefix: string, token?: string) {
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix) && (!token || key > token))
      .sort();
    const objects: ListedObject[] = keys
      .slice(0, 2)
      .map((key) => ({ key, lastModified: this.objects.get(key)! }));
    return { objects, nextToken: keys.length > 2 ? objects[1]!.key : null };
  }
}

describe('file purges (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  const storage = new MemoryStorage();
  const service = new FilePurgeService(
    new FilePurgeRepository(fixture.tenant),
    {
      maintenanceStoreIds: async (after: string | null) =>
        after === null ? [fixture.a, fixture.b] : [],
    } as StoresService,
    storage as unknown as FileStorageDriver,
    { now: () => NOW } as Clock,
  );

  const insertFile = async (storeId: string, key: string, expiresAt: Date | null) => {
    const id = randomUUID();
    await owner.query(
      `insert into files (id, store_id, purpose, object_key, content_type, size_bytes, status, expires_at)
       values ($1, $2, 'import', $3, 'text/csv', 10, 'ready', $4)`,
      [id, storeId, key, expiresAt],
    );
    storage.objects.set(key, new Date(NOW.getTime() - 48 * HOUR));
    return id;
  };
  const remaining = async () =>
    (
      await owner.query('select object_key from files where store_id = any($1::uuid[])', [
        [fixture.a, fixture.b],
      ])
    ).rows.map((row) => row.object_key as string);

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    await owner.query('delete from imports where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from files where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.close();
  });

  it('excludes every foreign key that points at files, apart from store-less settlement reports', async () => {
    const { rows } = await owner.query(`
      select distinct c.conrelid::regclass::text as "table", a.attname as "column"
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(local_column, files_column)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.local_column
      join pg_attribute f on f.attrelid = c.confrelid and f.attnum = k.files_column and f.attname = 'id'
      where c.contype = 'f' and c.confrelid = 'public.files'::regclass`);
    const found = rows.map((row) => `${row.table}.${row.column}`).sort();
    const excluded = FILE_REFERENCES.flatMap(({ table, columns }) =>
      columns.map((column) => `${table}.${column}`),
    );
    expect(found).toEqual([...excluded, 'gateway_settlement_lines.report_file_id'].sort());
  });

  it('deletes expired files and their objects in every store, and leaves live and referenced ones', async () => {
    const past = new Date(Date.now() - HOUR);
    const future = new Date(Date.now() + 24 * HOUR);
    await insertFile(fixture.a, `imports/${fixture.a}/expired.csv`, past);
    await insertFile(fixture.b, `imports/${fixture.b}/expired.csv`, past);
    await insertFile(fixture.a, `imports/${fixture.a}/live.csv`, future);
    await insertFile(fixture.a, `stores/${fixture.a}/logo`, null);
    const referenced = await insertFile(fixture.a, `imports/${fixture.a}/used.csv`, past);
    await owner.query(
      `insert into imports (id, store_id, kind, file_id) values ($1, $2, 'customers_csv', $3)`,
      [randomUUID(), fixture.a, referenced],
    );

    await service.purgeExpiredFiles();

    expect((await remaining()).sort()).toEqual(
      [
        `imports/${fixture.a}/live.csv`,
        `imports/${fixture.a}/used.csv`,
        `stores/${fixture.a}/logo`,
      ].sort(),
    );
    expect(storage.deleted.sort()).toEqual(
      [`imports/${fixture.a}/expired.csv`, `imports/${fixture.b}/expired.csv`].sort(),
    );
  });

  it('deletes product objects with no files row after 24 hours and keeps recent and known ones', async () => {
    const prefix = `stores/${fixture.a}/products/`;
    const old = new Date(NOW.getTime() - 25 * HOUR);
    const recent = new Date(NOW.getTime() - 2 * HOUR);
    for (const name of ['a', 'b', 'c', 'd']) storage.objects.set(`${prefix}orphan-${name}`, old);
    storage.objects.set(`${prefix}recent`, recent);
    storage.objects.set(`${prefix}known`, old);
    await owner.query(
      `insert into files (id, store_id, purpose, object_key, content_type, size_bytes, status)
       values ($1, $2, 'product_image', $3, 'image/png', 10, 'ready')`,
      [randomUUID(), fixture.a, `${prefix}known`],
    );
    storage.deleted.length = 0;

    await service.purgeOrphanProductObjects();

    expect(storage.deleted.sort()).toEqual(
      ['a', 'b', 'c', 'd'].map((name) => `${prefix}orphan-${name}`),
    );
    expect([...storage.objects.keys()]).toEqual(
      expect.arrayContaining([`${prefix}recent`, `${prefix}known`]),
    );
  });
});
