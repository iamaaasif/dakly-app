import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { KhataScansRepository } from './khata-scans.repository';

describe('khata scan filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new KhataScansRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(async () => {
    for (const table of ['khata_rows', 'khata_pages', 'files'])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await f.close();
  });

  const row = {
    rowNumber: 1,
    entryDate: null,
    name: 'রহিম',
    phone: null,
    item: null,
    amountPoisha: 50_000,
    kind: 'baki',
    confidence: 90,
    matchedContactId: null,
    matchKind: null,
  } as const;

  it('reads, queues, claims and finishes only the selected store’s page', async () => {
    const pageId = randomUUID();
    await repository.insertPage(f.a, {
      id: pageId,
      fileId: randomUUID(),
      objectKey: `khata/${f.a}/${pageId}`,
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      photoExpiresAt: new Date(Date.now() + 86_400_000),
      createdByUserId: f.userA,
    });
    const now = new Date();
    const stale = new Date(now.getTime() - 300_000);

    expect(await repository.findPage(f.b, pageId)).toBeUndefined();
    expect(await repository.listPages(f.b, 10)).toEqual([]);
    expect(await repository.markQueued(f.b, pageId)).toBe(false);
    expect(await repository.markQueued(f.a, pageId)).toBe(true);
    expect(await repository.claim(f.b, pageId, now, stale)).toBe(false);
    expect(await repository.claim(f.a, pageId, now, stale)).toBe(true);

    await repository.saveRead(f.a, pageId, [row]);
    await repository.finish(f.b, pageId, { status: 'unreadable' });

    expect(await repository.rowsForPages(f.b, [pageId])).toEqual([]);
    expect(await repository.rowsForPages(f.a, [pageId])).toHaveLength(1);
    expect((await repository.findPage(f.a, pageId))?.status).toBe('read');
  });
});
