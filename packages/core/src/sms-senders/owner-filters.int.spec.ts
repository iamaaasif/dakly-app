import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SmsSendersRepository } from './sms-senders.repository';

describe('sms sender filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new SmsSendersRepository(f.tenant, f.connection.db);
  beforeAll(() => f.setup());
  afterAll(async () => {
    await f.connection.pool.query('delete from sms_sender_ids where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.close();
  });
  it('reads and decides only the selected store’s sender', async () => {
    const created = await repository.insert(f.a, 'Rina Shop', f.userA);
    const decision = { status: 'approved', rejectionReason: null, decidedAt: new Date() } as const;
    await f.connection.pool.query("update sms_sender_ids set status='approved' where id=$1", [
      created!.id,
    ]);

    expect(await repository.findById(f.b, created!.id)).toBeUndefined();
    expect(await repository.list(f.b, { limit: 50 })).toEqual([]);
    expect(await repository.findApprovedName(f.b)).toBeUndefined();
    expect(await repository.decide(f.b, created!.id, ['approved'], decision)).toBeUndefined();
    expect(await repository.findApprovedName(f.a)).toBe('Rina Shop');
    expect(await repository.insert(f.b, 'Karim Shop', f.userB)).toMatchObject({
      status: 'requested',
    });
  });
});
