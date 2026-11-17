import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ImportsRepository } from './imports.repository';

const mapping = { phone: 0, name: 1 };

function upload(storeId: string) {
  const id = randomUUID();
  return {
    id,
    objectKey: `stores/${storeId}/imports/${id}.csv`,
    sizeBytes: 120,
    expiresAt: new Date('2026-11-24T04:30:00Z'),
  };
}

describe('import filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new ImportsRepository(f.tenant);
  beforeAll(() => f.setup());
  afterAll(() => f.close());

  it('creates, reads and starts an import only in the selected store', async () => {
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

    expect((await f.row('imports', importB)).status).toBe('uploaded');
  });
});
