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

  it('creates, starts, claims, counts and finishes an import only in the selected store', async () => {
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

    const lease = new Date('2026-11-17T04:30:00Z');
    const stale = new Date('2026-11-17T04:25:00Z');
    expect(await repository.claim(f.b, importA, lease, stale)).toBe(false);
    expect(await repository.claim(f.a, importA, lease, stale)).toBe(true);
    expect(await repository.claim(f.a, importA, lease, stale)).toBe(false);
    const renewed = { held: lease, renewed: new Date('2026-11-17T04:30:30Z') };
    expect(await repository.saveProgress(f.b, importA, counts, renewed)).toBe(false);
    expect((await f.row('imports', importA)).rows_total).toBeNull();
    expect(await repository.saveProgress(f.a, importA, counts, renewed)).toBe(true);
    await repository.releaseClaim(f.b, importA, renewed.renewed);
    expect((await f.row('imports', importA)).claimed_at).not.toBeNull();
    await repository.markUploadReady(f.b, fileA.id);
    expect((await f.row('files', fileA.id)).status).toBe('pending');
    await repository.markUploadReady(f.a, fileA.id);
    expect((await f.row('files', fileA.id)).status).toBe('ready');

    const late = new Date('2026-11-17T06:00:00Z');
    expect(await repository.storesWithStuckImports(late)).toContain(f.a);
    expect(await repository.listStuck(f.b, late)).toEqual([]);
    expect(await repository.listStuck(f.a, late)).toEqual([
      { id: importA, claimedAt: renewed.renewed },
    ]);
    const requeue = { before: late, now: late, limit: 1 };
    expect(await repository.requeue(f.b, importA, requeue)).toBe(false);
    expect(await repository.requeue(f.a, importA, requeue)).toBe(true);
    expect(await repository.requeue(f.a, importA, requeue)).toBe(false);
    expect(await f.row('imports', importA)).toMatchObject({ requeue_count: 1 });

    const report = { ...upload(f.a), status: 'ready' as const };
    const finishedAt = new Date('2026-11-17T04:31:00Z');
    const done = { status: 'done', counts, finishedAt } as const;
    expect(
      await repository.finish(f.b, importA, { lease: renewed.renewed, result: done, report }),
    ).toBe(false);
    expect(await repository.finish(f.a, importA, { lease: lease, result: done, report })).toBe(
      false,
    );
    expect(await f.row('files', report.id)).toBeUndefined();
    expect((await f.row('imports', importA)).status).toBe('importing');
    expect(
      await repository.finish(f.a, importA, { lease: renewed.renewed, result: done, report }),
    ).toBe(true);
    expect(await repository.findById(f.a, importA)).toMatchObject({
      status: 'done',
      rowsAdded: 2,
      reportKey: report.objectKey,
    });
    expect((await f.row('imports', importB)).status).toBe('uploaded');
  });
});
