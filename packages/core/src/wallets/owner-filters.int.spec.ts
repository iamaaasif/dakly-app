import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { WalletLedgerRepository } from './wallet-ledger.repository';
import { WalletService } from './wallet.service';

describe('wallet ledger filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new WalletLedgerRepository(f.tenant);
  const wallets = new WalletService(
    repository,
    new StoreTransaction(f.tenant),
    new OutboxService(
      new OutboxRepository(f.connection.db, f.tenant),
      new StoreTransaction(f.tenant),
    ),
    new Clock(),
  );
  const system = { kind: 'system' } as const;
  beforeAll(() => f.setup());
  afterAll(async () => {
    await f.connection.pool.query('delete from wallet_ledger where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.close();
  });
  it('reads and settles only the selected store ledger', async () => {
    await f.connection.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',10,10,'seed','system')",
      [f.a],
    );
    const key = randomUUID();
    const reservation = await wallets.reserve(f.a, {
      wallet: 'sms_credits',
      quantity: 3,
      idempotencyKey: key,
      actor: system,
    });
    expect((await f.row('wallet_ledger', reservation.entryId)).store_id).toBe(f.a);
    expect(await repository.findById(f.b, reservation.entryId)).toBeUndefined();
    expect(await repository.findByIdempotencyKey(f.b, key)).toBeUndefined();
    expect(await repository.latest(f.b, 'sms_credits')).toBeUndefined();
    await expect(
      wallets.release(f.b, {
        reservationId: reservation.entryId,
        idempotencyKey: randomUUID(),
        actor: system,
      }),
    ).rejects.toMatchObject({ code: 'WALLET_RESERVATION_NOT_FOUND' });
    expect(await wallets.balance(f.a, 'sms_credits')).toBe(7);
  });
});
