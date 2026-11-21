import { randomUUID } from 'node:crypto';

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
    await f.connection.pool.query('delete from files where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });
  async function documents(storeId: string) {
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids)
      await f.connection.pool.query(
        `insert into files(id,store_id,purpose,object_key,content_type,size_bytes,status)
         values($1,$2,'sms_sender_document',$3,'application/pdf',1000,'ready')`,
        [id, storeId, `stores/${storeId}/sms_sender_document/${id}`],
      );
    return { tradeLicenceFileId: ids[0]!, nidFileId: ids[1]! };
  }

  it('reads and decides only the selected store’s sender', async () => {
    const created = await repository.insert(
      f.a,
      { senderName: 'Rina Shop', ...(await documents(f.a)) },
      f.userA,
    );
    const decision = { status: 'approved', rejectionReason: null, decidedAt: new Date() } as const;
    await f.connection.pool.query("update sms_sender_ids set status='approved' where id=$1", [
      created!.id,
    ]);

    expect(await repository.findById(f.b, created!.id)).toBeUndefined();
    expect(await repository.list(f.b, { limit: 50 })).toEqual([]);
    expect(await repository.findApprovedName(f.b)).toBeUndefined();
    expect(await repository.decide(f.b, created!.id, ['approved'], decision)).toBeUndefined();
    expect(await repository.findApprovedName(f.a)).toBe('Rina Shop');
    expect(
      await repository.insert(
        f.b,
        { senderName: 'Karim Shop', ...(await documents(f.b)) },
        f.userB,
      ),
    ).toMatchObject({
      status: 'requested',
    });
  });
});
