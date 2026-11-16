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
});
