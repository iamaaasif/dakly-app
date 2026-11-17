import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ImportsRepository } from './imports.repository';

const counts = { rowsTotal: 3, rowsAdded: 2, rowsUpdated: 1, rowsSkipped: 0, rowsFailed: 0 };
const mapping = { phone: 0, name: 1 };

function upload(storeId: string) {
  const id = randomUUID();
  return {
    id,
    objectKey: `imports/${storeId}/${id}.csv`,
    contentType: 'text/csv',
    sizeBytes: 120,
    status: 'pending' as const,
    expiresAt: new Date('2026-11-24T04:30:00Z'),
  };
}

describe('import filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new ImportsRepository(f.tenant, f.connection.db);
  beforeAll(() => f.setup());
  afterAll(() => f.close());

  it.each([
    ['recent progress', 4, '2026-11-17T06:00:00Z'],
    ['retries remaining', 3, '2026-11-17T04:30:00Z'],
  ])(
    'does not fail an import with %s after the sweep read it',
    async (_case, retries, progress) => {
      const importId = randomUUID();
      const lease = new Date('2026-11-17T04:30:00Z');
      const now = new Date('2026-11-17T06:00:00Z');
      await repository.createCustomerImport(f.a, importId, upload(f.a), f.userA);
      await f.connection.pool.query(
        "update imports set status='importing', claimed_at=$2, last_progress_at=$3, requeue_count=$4 where id=$1",
        [importId, lease, progress, retries],
      );
      const report = { ...upload(f.a), status: 'ready' as const };
      expect(
        await repository.finish(f.a, importId, {
          lease,
          result: { status: 'failed', finishedAt: now },
          report,
          stalled: { before: new Date('2026-11-17T05:45:00Z'), limit: 4 },
        }),
      ).toBe(false);
      expect((await repository.findById(f.a, importId))?.status).toBe('importing');
      expect(await f.row('files', report.id)).toBeUndefined();
      await f.connection.pool.query('delete from imports where id=$1', [importId]);
    },
  );

  it('creates, starts and finishes an import only in the selected store', async () => {
    const importA = randomUUID();
    const importB = randomUUID();
    const fileA = upload(f.a);
    await repository.createCustomerImport(f.a, importA, fileA, f.userA);
    await repository.createCustomerImport(f.b, importB, upload(f.b), f.userB);
    expect(await f.row('imports', importA)).toMatchObject({ store_id: f.a, status: 'uploaded' });
    expect(await f.row('files', fileA.id)).toMatchObject({ store_id: f.a, purpose: 'import' });
    expect(await repository.findById(f.b, importA)).toBeUndefined();
    expect(await repository.findById(f.a, importA)).toMatchObject({ uploadKey: fileA.objectKey });

    const started = {
      columnMapping: mapping,
      duplicateMode: 'update',
      consentEvidence: { sms: 'দোকানের খাতায় সই' },
      hasConsentConfirmation: true,
      startedAt: new Date('2026-11-17T04:30:00Z'),
    } as const;
    expect(await repository.start(f.b, importA, started)).toBe(false);
    expect(await repository.start(f.a, importA, started)).toBe(true);
    expect(await repository.start(f.a, importA, started)).toBe(false);

    // The app writes leases from its clock, in whole milliseconds.
    const lease = new Date('2026-11-17T04:30:00Z');
    await f.connection.pool.query('update imports set claimed_at=$2 where id=$1', [importA, lease]);
    const late = new Date('2026-11-17T06:00:00Z');
    expect(await repository.storesWithStuckImports(late)).toContain(f.a);
    expect(await repository.listStuck(f.b, late)).toEqual([]);
    expect(await repository.listStuck(f.a, late)).toEqual([{ id: importA, claimedAt: lease }]);
    const requeue = { before: late, now: late, limit: 1 };
    expect(await repository.requeue(f.b, importA, requeue)).toBe(false);
    expect(await repository.requeue(f.a, importA, requeue)).toBe(true);
    expect(await repository.requeue(f.a, importA, requeue)).toBe(false);
    expect(await f.row('imports', importA)).toMatchObject({ requeue_count: 1 });

    const report = { ...upload(f.a), status: 'ready' as const };
    const done = { status: 'failed', counts, finishedAt: late } as const;
    expect(await repository.finish(f.b, importA, { lease, result: done, report })).toBe(false);
    expect(await repository.finish(f.a, importA, { lease: null, result: done, report })).toBe(
      false,
    );
    expect(await f.row('files', report.id)).toBeUndefined();
    expect(await repository.finish(f.a, importA, { lease, result: done, report })).toBe(true);
    expect(await repository.findById(f.a, importA)).toMatchObject({
      status: 'failed',
      reportKey: report.objectKey,
    });
    expect((await f.row('imports', importB)).status).toBe('uploaded');
  });
});
