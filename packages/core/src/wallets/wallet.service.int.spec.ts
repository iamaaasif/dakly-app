import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppError } from '../platform/errors/app-error';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import { WalletLedgerRepository } from './wallet-ledger.repository';
import { WalletService } from './wallet.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const app = createDatabase(process.env.DATABASE_URL!);
const tenant = new TenantDatabase(app.db);
const wallets = new WalletService(
  new WalletLedgerRepository(tenant),
  new StoreTransaction(tenant),
  new OutboxService(new OutboxRepository(app.db, tenant), new StoreTransaction(tenant)),
  new Clock(),
);
const system = { kind: 'system' } as const;
const storeIds: string[] = [];
const staffIds: string[] = [];

async function store(smsCredits = 0) {
  const id = randomUUID();
  storeIds.push(id);
  await admin.pool.query('insert into stores(id,name) values($1,$2)', [id, 'রিনার দোকান']);
  if (smsCredits)
    await admin.pool.query(
      "insert into wallet_ledger(id,store_id,wallet,revision,kind,quantity_delta,balance_quantity_after,idempotency_key,actor_type) values(gen_random_uuid(),$1,'sms_credits',1,'top_up',$2,$2,$3,'system')",
      [id, smsCredits, `seed-${id}`],
    );
  return id;
}

async function ledger(storeId: string) {
  return (
    await admin.pool.query(
      'select kind,quantity_delta::int as delta,balance_quantity_after::int as after,revision from wallet_ledger where store_id=$1 order by wallet,revision',
      [storeId],
    )
  ).rows as { kind: string; delta: number; after: number; revision: number }[];
}

function reserve(storeId: string, quantity: number, idempotencyKey = randomUUID()) {
  return wallets.reserve(storeId, {
    wallet: 'sms_credits',
    quantity,
    idempotencyKey,
    actor: system,
  });
}

async function errorCode(work: Promise<unknown>) {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

beforeAll(async () => {
  const role = await app.pool.query(
    'select current_user, rolbypassrls from pg_roles where rolname=current_user',
  );
  expect(role.rows).toEqual([{ current_user: 'dakly_app', rolbypassrls: false }]);
});

afterAll(async () => {
  await admin.pool.query('delete from outbox_events where store_id=any($1::uuid[])', [storeIds]);
  await admin.pool.query('delete from wallet_ledger where store_id=any($1::uuid[])', [storeIds]);
  await admin.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await admin.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await Promise.all([admin.pool.end(), app.pool.end()]);
});

describe('WalletService (Postgres)', () => {
  it('lets exactly 10 of 20 parallel reserves of 1 through a balance of 10', async () => {
    const storeId = await store(10);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => reserve(storeId, 1)));
    const passed = results.filter((result) => result.status === 'fulfilled');
    const refused = results.flatMap((result) =>
      result.status === 'rejected' ? [(result.reason as AppError).code] : [],
    );
    expect(passed).toHaveLength(10);
    expect(refused).toEqual(Array.from({ length: 10 }, () => 'WALLET_BALANCE_TOO_LOW'));
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(0);
    const rows = await ledger(storeId);
    expect(rows.map((row) => row.revision)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    expect(rows.slice(1).map((row) => row.after)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('writes one row for the same idempotency key and returns the first result', async () => {
    const storeId = await store(5);
    const key = randomUUID();
    const first = await reserve(storeId, 2, key);
    const again = await reserve(storeId, 3, key);
    expect(again).toEqual(first);
    expect(first.balanceQuantity).toBe(3);
    expect(await ledger(storeId)).toHaveLength(2);
    const release = { reservationId: first.entryId, idempotencyKey: randomUUID(), actor: system };
    expect(await wallets.release(storeId, release)).toEqual(
      await wallets.release(storeId, release),
    );
    expect(await ledger(storeId)).toHaveLength(3);
  });

  it('refuses a release after a charge and a charge after a release', async () => {
    const storeId = await store(10);
    const charged = await reserve(storeId, 4);
    await wallets.charge(storeId, {
      reservationId: charged.entryId,
      quantity: 4,
      idempotencyKey: randomUUID(),
      actor: system,
    });
    const released = await reserve(storeId, 3);
    await wallets.release(storeId, {
      reservationId: released.entryId,
      idempotencyKey: randomUUID(),
      actor: system,
    });
    const before = await ledger(storeId);
    expect(
      await errorCode(
        wallets.release(storeId, {
          reservationId: charged.entryId,
          idempotencyKey: randomUUID(),
          actor: system,
        }),
      ),
    ).toBe('WALLET_RESERVATION_SETTLED');
    expect(
      await errorCode(
        wallets.charge(storeId, {
          reservationId: released.entryId,
          quantity: 1,
          idempotencyKey: randomUUID(),
          actor: system,
        }),
      ),
    ).toBe('WALLET_RESERVATION_SETTLED');
    expect(await ledger(storeId)).toEqual(before);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(6);
  });

  it('releases the rest of a smaller charge and refuses a charge over the reservation', async () => {
    const storeId = await store(10);
    const reservation = await reserve(storeId, 5);
    const settle = { reservationId: reservation.entryId, actor: system };
    expect(
      await errorCode(wallets.charge(storeId, { ...settle, quantity: 6, idempotencyKey: 'over' })),
    ).toBe('WALLET_CHARGE_OVER_RESERVATION');
    const charge = await wallets.charge(storeId, { ...settle, quantity: 2, idempotencyKey: 'two' });
    expect(charge.balanceQuantity).toBe(8);
    expect((await ledger(storeId)).slice(1)).toEqual([
      { kind: 'reserve', delta: -5, after: 5, revision: 2 },
      { kind: 'release', delta: 5, after: 10, revision: 3 },
      { kind: 'charge', delta: -2, after: 8, revision: 4 },
    ]);
    expect(
      await errorCode(wallets.release(storeId, { ...settle, idempotencyKey: randomUUID() })),
    ).toBe('WALLET_RESERVATION_SETTLED');
    expect(
      await errorCode(
        wallets.release(storeId, { ...settle, reservationId: randomUUID(), idempotencyKey: 'x' }),
      ),
    ).toBe('WALLET_RESERVATION_NOT_FOUND');
  });

  it('keeps store B away from store A ledger', async () => {
    const storeA = await store(10);
    const storeB = await store();
    const reservation = await reserve(storeA, 4);
    const before = await ledger(storeA);
    expect(await wallets.balance(storeB, 'sms_credits')).toBe(0);
    // Store A's key must not replay A's entry for store B.
    expect(
      await errorCode(
        wallets.reserve(storeB, {
          wallet: 'sms_credits',
          quantity: 1,
          idempotencyKey: `seed-${storeA}`,
          actor: system,
        }),
      ),
    ).toBe('WALLET_BALANCE_TOO_LOW');
    const settle = {
      reservationId: reservation.entryId,
      idempotencyKey: randomUUID(),
      actor: system,
    };
    expect(await errorCode(wallets.release(storeB, settle))).toBe('WALLET_RESERVATION_NOT_FOUND');
    expect(await errorCode(wallets.charge(storeB, { ...settle, quantity: 1 }))).toBe(
      'WALLET_RESERVATION_NOT_FOUND',
    );
    expect(await ledger(storeA)).toEqual(before);
    expect(await ledger(storeB)).toEqual([]);
    const unfiltered = await tenant.forStore(storeB, (tx) =>
      tx.execute(sql`select id from wallet_ledger`),
    );
    expect(unfiltered.rows).toEqual([]);
  });

  it('refuses a zero or negative quantity and writes nothing', async () => {
    const storeId = await store(10);
    const reservation = await reserve(storeId, 4);
    const before = await ledger(storeId);
    const settle = { reservationId: reservation.entryId, actor: system };
    for (const quantity of [0, -3]) {
      expect(await errorCode(reserve(storeId, quantity))).toBe('WALLET_QUANTITY_INVALID');
      expect(
        await errorCode(
          wallets.charge(storeId, { ...settle, quantity, idempotencyKey: randomUUID() }),
        ),
      ).toBe('WALLET_QUANTITY_INVALID');
      expect(
        await errorCode(
          wallets.credit(storeId, {
            wallet: 'sms_credits',
            quantity,
            idempotencyKey: randomUUID(),
            staffUserId: randomUUID(),
            staffAuditId: randomUUID(),
          }),
        ),
      ).toBe('WALLET_QUANTITY_INVALID');
    }
    expect(await ledger(storeId)).toEqual(before);
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(6);
  });

  it('returns the first charge for the same key and writes its two rows once', async () => {
    const storeId = await store(10);
    const reservation = await reserve(storeId, 5);
    const input = {
      reservationId: reservation.entryId,
      quantity: 3,
      idempotencyKey: randomUUID(),
      actor: system,
    };
    const first = await wallets.charge(storeId, input);
    expect(await wallets.charge(storeId, input)).toEqual(first);
    expect(first.balanceQuantity).toBe(7);
    const keys = (
      await admin.pool.query(
        'select idempotency_key from wallet_ledger where store_id=$1 and reference_id=$2 order by revision',
        [storeId, reservation.entryId],
      )
    ).rows.map((row: { idempotency_key: string }) => row.idempotency_key);
    expect(keys).toEqual([`${input.idempotencyKey}:release`, input.idempotencyKey]);
  });

  it('settles a reservation once when release and charge run at the same time', async () => {
    const storeId = await store(10);
    const reservation = await reserve(storeId, 4);
    const settle = { reservationId: reservation.entryId, actor: system };
    const results = await Promise.allSettled([
      wallets.release(storeId, { ...settle, idempotencyKey: randomUUID() }),
      wallets.charge(storeId, { ...settle, quantity: 2, idempotencyKey: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.flatMap((result) =>
        result.status === 'rejected' ? [(result.reason as AppError).code] : [],
      ),
    ).toEqual(['WALLET_RESERVATION_SETTLED']);
    const releases = await admin.pool.query(
      "select id from wallet_ledger where store_id=$1 and reference_id=$2 and kind='release'",
      [storeId, reservation.entryId],
    );
    expect(releases.rowCount).toBe(1);
  });

  it('credits as staff with the staff audit reference and returns the first credit again', async () => {
    const storeId = await store();
    const staffUserId = randomUUID(),
      staffAuditId = randomUUID();
    staffIds.push(staffUserId);
    await admin.pool.query(
      "insert into staff_users(id,email,name,role,access_subject,enrolled_at) values($1::uuid,$2,'করিম','support',$1::text,now())",
      [staffUserId, `${staffUserId}@example.test`],
    );
    const input = {
      wallet: 'whatsapp_poisha',
      quantity: 50000,
      idempotencyKey: randomUUID(),
      staffUserId,
      staffAuditId,
    } as const;
    const credit = await wallets.credit(storeId, input);
    expect(credit.balanceQuantity).toBe(50000);
    expect(await wallets.credit(storeId, input)).toEqual(credit);
    expect(await wallets.balance(storeId, 'whatsapp_poisha')).toBe(50000);
    const rows = await admin.pool.query(
      'select kind,quantity_delta::int as delta,actor_type,actor_staff_id,reference_type,reference_id from wallet_ledger where store_id=$1',
      [storeId],
    );
    expect(rows.rows).toEqual([
      {
        kind: 'adjustment',
        delta: 50000,
        actor_type: 'staff',
        actor_staff_id: staffUserId,
        reference_type: 'staff_audit',
        reference_id: staffAuditId,
      },
    ]);
    // A new credit tells the workflows that wait for one; the replay writes no event.
    const events = await admin.pool.query(
      "select payload from outbox_events where store_id=$1 and type='wallet.credited'",
      [storeId],
    );
    expect(events.rows).toEqual([
      { payload: { wallet: 'whatsapp_poisha', entryId: credit.entryId } },
    ]);
  });

  it('maps the negative balance check constraint to a typed result', async () => {
    const storeId = await store();
    const repository = new WalletLedgerRepository(tenant);
    const result = await new StoreTransaction(tenant).run(storeId, () =>
      repository.insert(storeId, [
        {
          wallet: 'sms_credits',
          revision: 1,
          kind: 'reserve',
          quantityDelta: -1,
          balanceQuantityAfter: -1,
          idempotencyKey: randomUUID(),
          actorType: 'system',
        },
      ]),
    );
    expect(result).toBe('balance_negative');
    expect(await ledger(storeId)).toEqual([]);
  });

  it('keeps the balance equal to the sum of deltas after any sequence', async () => {
    const storeId = await store(20);
    const first = await reserve(storeId, 7);
    const second = await reserve(storeId, 6);
    await wallets.charge(storeId, {
      reservationId: first.entryId,
      quantity: 7,
      idempotencyKey: randomUUID(),
      actor: system,
    });
    await reserve(storeId, 3);
    await wallets.release(storeId, {
      reservationId: second.entryId,
      idempotencyKey: randomUUID(),
      actor: system,
    });
    expect(await errorCode(reserve(storeId, 11))).toBe('WALLET_BALANCE_TOO_LOW');
    await wallets.charge(storeId, {
      reservationId: (await reserve(storeId, 10)).entryId,
      quantity: 1,
      idempotencyKey: randomUUID(),
      actor: system,
    });
    const rows = await ledger(storeId);
    let sum = 0;
    for (const row of rows) {
      sum += row.delta;
      expect(row.after).toBe(sum);
    }
    expect(await wallets.balance(storeId, 'sms_credits')).toBe(sum);
    expect(sum).toBe(9);
  });
});
