import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { ConsentsRepository } from './consents.repository';

const answer = {
  channel: 'sms',
  status: 'granted',
  source: 'manual',
  evidence: 'দোকানের খাতায় সই করেছেন',
  capturedByUserId: null,
  capturedAt: new Date('2026-11-16T04:30:00Z'),
} as const;

describe('consent filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new ConsentsRepository(f.tenant);
  const contactA = randomUUID();
  const contactB = randomUUID();
  beforeAll(async () => {
    await f.setup();
    await f.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer'),($3,$4,'করিম','manual','customer')",
      [contactA, f.a, contactB, f.b],
    );
  });
  afterAll(() => f.close());
  it('inserts into the selected store and reads only its current consent', async () => {
    const a = await repository.insert(f.a, { ...answer, contactId: contactA });
    await repository.insert(f.b, { ...answer, contactId: contactB });

    expect((await f.row('consents', a.id)).store_id).toBe(f.a);
    expect(await repository.listCurrent(f.b, [contactA, contactB], 'sms')).toEqual([
      expect.objectContaining({ contactId: contactB, status: 'granted' }),
    ]);
    expect(await repository.listCurrent(f.a, [contactA, contactB], 'sms')).toEqual([
      expect.objectContaining({ contactId: contactA }),
    ]);
  });

  it('inserts a batch only into the selected store', async () => {
    const [a] = await repository.insertAll(f.a, [{ ...answer, contactId: contactA }]);
    expect((await f.row('consents', a!.id)).store_id).toBe(f.a);
    await expect(repository.insertAll(f.b, [{ ...answer, contactId: contactA }])).rejects.toThrow();
  });

  it('finds an import grant only in its store and excludes a later answer in the view ordering', async () => {
    const importId = randomUUID();
    const fileId = randomUUID();
    await f.connection.pool.query(
      "insert into files(id,store_id,purpose,object_key,content_type,size_bytes) values($1::uuid,$2,'import',$1::text,'text/csv',10)",
      [fileId, f.a],
    );
    await f.connection.pool.query(
      "insert into imports(id,store_id,kind,file_id) values($1,$2,'customers_csv',$3)",
      [importId, f.a, fileId],
    );
    const grant = await repository.insert(f.a, {
      ...answer,
      contactId: contactA,
      importId,
      source: 'import',
      capturedAt: new Date('2026-11-18T00:00:00Z'),
    });
    expect(await repository.listImportGrants(f.b, importId)).toEqual([]);
    expect(await repository.listUnchangedGrants(f.b, [grant.id])).toEqual([]);
    expect(await repository.listImportGrants(f.a, importId)).toEqual([grant]);
    expect(await repository.listImportGrants(f.a, importId, grant.id)).toEqual([]);
    expect(await repository.listUnchangedGrants(f.a, [grant.id])).toEqual([grant]);
    await repository.insert(f.a, {
      ...answer,
      contactId: contactA,
      status: 'withdrawn',
      capturedAt: grant.capturedAt,
    });
    expect(await repository.listUnchangedGrants(f.a, [grant.id])).toEqual([]);
    const restored = await repository.insert(f.a, {
      ...answer,
      contactId: contactA,
      status: 'not_answered',
      source: 'import',
      capturedAt: new Date('2026-11-18T00:01:00Z'),
    });
    expect(await repository.listCurrent(f.a, [contactA], 'sms')).toEqual([
      expect.objectContaining({ status: 'not_answered', capturedAt: restored.capturedAt }),
    ]);
    expect(await repository.listUnchangedGrants(f.a, [grant.id])).toEqual([]);
    await repository.insert(f.a, {
      ...answer,
      contactId: contactA,
      channel: 'messenger',
      status: 'withdrawn',
      capturedAt: restored.capturedAt,
    });
    expect((await repository.listCurrent(f.a, [contactA])).map((row) => row.status).sort()).toEqual(
      ['not_answered', 'withdrawn'],
    );
    expect(await repository.listCurrent(f.b, [contactA])).toEqual([]);
    await expect(
      repository.insert(f.b, { ...answer, contactId: contactB, importId }),
    ).rejects.toThrow();
  });
});
