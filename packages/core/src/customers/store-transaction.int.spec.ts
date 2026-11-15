import { randomBytes } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import { contacts } from '@dakly/db/schema/contacts';
import { customers } from '@dakly/db/schema/customers';
import { stores } from '@dakly/db/schema/stores';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { CustomersRepository } from './customers.repository';

// The second repository stays in the test until contacts has its own feature.
class ContactsRepository {
  constructor(private readonly database: TenantDatabase) {}

  insert(storeId: string, phone: string): Promise<void> {
    return this.database.forStore(storeId, async (tx) => {
      await tx.insert(contacts).values({ storeId, phone, source: 'manual', kind: 'lead' });
      throw new Error('Contact action failed');
    });
  }
}

describe('TenantDatabase transactions (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const database = new TenantDatabase(app.db);
  const transaction = new StoreTransaction(database);
  const repository = new CustomersRepository(database);
  const contactRepository = new ContactsRepository(database);
  let storeA: string;
  let storeB: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    const created = await admin.db
      .insert(stores)
      .values([{ name: 'Atomic A' }, { name: 'Atomic B' }])
      .returning({ id: stores.id });
    storeA = created[0]!.id;
    storeB = created[1]!.id;
  });

  afterAll(async () => {
    await admin.db.delete(customers).where(inArray(customers.storeId, [storeA, storeB]));
    await admin.db.delete(contacts).where(inArray(contacts.storeId, [storeA, storeB]));
    await admin.db.delete(stores).where(inArray(stores.id, [storeA, storeB]));
    if (userIds.length) await admin.db.delete(users).where(inArray(users.id, userIds));
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('rolls back both repositories when the second action fails', async () => {
    await expect(
      transaction.run(storeA, async () => {
        await repository.insert(storeA, { name: 'Rahim', phone: '01711000001' });
        await contactRepository.insert(storeA, '01711000001');
      }),
    ).rejects.toThrow('Contact action failed');

    expect(await customerWithPhone(storeA, '01711000001')).toEqual([]);
    expect(
      await admin.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.storeId, storeA), eq(contacts.phone, '01711000001'))),
    ).toEqual([]);
  });

  it('joins nested calls for the same store and returns their result', async () => {
    const result = await database.forStore(storeA, async (outer) => {
      await outer.insert(customers).values({ storeId: storeA, name: 'Rina', phone: '01711000002' });
      return database.forStore(storeA, async (inner) => {
        const rows = await inner
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.phone, '01711000002'));
        return rows[0]?.name;
      });
    });

    expect(result).toBe('Rina');
  });

  it('rejects another store inside the scope and rolls back the outer write', async () => {
    await expect(
      database.forStore(storeA, async () => {
        await repository.insert(storeA, { name: 'Sumi', phone: '01711000003' });
        await repository.insert(storeB, { name: 'Karim', phone: '01711000003' });
      }),
    ).rejects.toThrow();

    expect(await customerWithPhone(storeA, '01711000003')).toEqual([]);
    expect(await customerWithPhone(storeB, '01711000003')).toEqual([]);
  });

  it.each(['commit', 'rollback'])('clears the scope after %s', async (outcome) => {
    await database
      .forStore(storeA, async () => {
        if (outcome === 'rollback') throw new Error('Rollback');
      })
      .catch((error: Error) => {
        if (outcome !== 'rollback') throw error;
      });

    const customer = await repository.insert(storeB, {
      name: 'Farhana',
      phone: outcome === 'commit' ? '01711000004' : '01711000005',
    });
    expect(await repository.findById(storeB, customer!.id)).toMatchObject({ name: 'Farhana' });
    const setting = await app.db.execute<{ store_id: string | null }>(
      sql`select current_setting('app.store_id', true) as store_id`,
    );
    expect(setting.rows[0]?.store_id || null).toBeNull();
  });

  it.each(['same store', 'different stores'])(
    'keeps overlapping requests for %s in separate transactions',
    async (storesUsed) => {
      const secondStore = storesUsed === 'same store' ? storeA : storeB;
      const firstPhone = storesUsed === 'same store' ? '01711000013' : '01711000006';
      const secondPhone = storesUsed === 'same store' ? '01711000014' : '01711000015';
      const resumedPhone = storesUsed === 'same store' ? '01711000016' : '01711000017';
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const first = database.forStore(storeA, async () => {
        await repository.insert(storeA, { name: 'Rahim', phone: firstPhone });
        entered.resolve();
        await release.promise;
        await repository.insert(storeA, { name: 'Rahim', phone: resumedPhone });
        throw new Error('First request failed');
      });
      const rejected = expect(first).rejects.toThrow('First request failed');
      await entered.promise;
      try {
        await repository.insert(secondStore, { name: 'Rina', phone: secondPhone });
      } finally {
        release.resolve();
      }
      await rejected;

      expect(await customerWithPhone(storeA, firstPhone)).toEqual([]);
      expect(await customerWithPhone(storeA, resumedPhone)).toEqual([]);
      expect(await customerWithPhone(secondStore, secondPhone)).toHaveLength(1);
    },
  );

  it.each(['commit', 'rollback'])(
    'rejects detached work inherited from a finished %s scope',
    async (outcome) => {
      const release = Promise.withResolvers<void>();
      let detached: Promise<unknown> = Promise.resolve();
      await database
        .forStore(storeA, async () => {
          detached = release.promise.then(() =>
            repository.insert(storeA, {
              name: 'Detached',
              phone: outcome === 'commit' ? '01711000007' : '01711000008',
            }),
          );
          if (outcome === 'rollback') throw new Error('Rollback');
        })
        .catch((error: Error) => {
          if (outcome !== 'rollback') throw error;
        });
      const rejected = expect(detached).rejects.toThrow();
      release.resolve();
      await rejected;

      expect(
        await customerWithPhone(storeA, outcome === 'commit' ? '01711000007' : '01711000008'),
      ).toEqual([]);
    },
  );

  it('leaves separately committed global users and sessions intact after tenant rollback', async () => {
    const [user] = await app.db
      .insert(users)
      .values({
        name: 'Farhana',
        email: `atomic-${randomBytes(8).toString('hex')}@example.com`,
      })
      .returning({ id: users.id });
    userIds.push(user!.id);
    const [session] = await app.db
      .insert(sessions)
      .values({
        userId: user!.id,
        tokenHash: randomBytes(32),
        expiresAt: new Date('2030-01-01'),
      })
      .returning({ id: sessions.id });

    await expect(
      database.forStore(storeA, async () => {
        await repository.insert(storeA, { name: 'Farhana', phone: '01711000009' });
        throw new Error('Store setup failed');
      }),
    ).rejects.toThrow('Store setup failed');

    expect(await app.db.select({ id: users.id }).from(users).where(eq(users.id, user!.id))).toEqual(
      [{ id: user!.id }],
    );
    expect(
      await app.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, session!.id)),
    ).toEqual([{ id: session!.id }]);
    expect(await customerWithPhone(storeA, '01711000009')).toEqual([]);
  });

  it('returns the result from a service action and joins a nested facade call', async () => {
    const result = await transaction.run(storeA, () =>
      transaction.run(storeA, async () => {
        const customer = await repository.insert(storeA, { name: 'Rina', phone: '01711000010' });
        return customer!.id;
      }),
    );

    expect(await repository.findById(storeA, result)).toMatchObject({ name: 'Rina' });
  });

  it('provides a UUID v7 for a new store and commits its dependent rows together', async () => {
    const result = await transaction.runForNewStore(async (storeId) => {
      expect(storeId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      await database.forStore(storeId, (tx) =>
        tx.insert(stores).values({ id: storeId, name: 'New store' }),
      );
      await repository.insert(storeId, { name: 'Sumi', phone: '01711000011' });
      return storeId;
    });

    try {
      expect(await customerWithPhone(result, '01711000011')).toHaveLength(1);
    } finally {
      await admin.db.delete(customers).where(eq(customers.storeId, result));
      await admin.db.delete(stores).where(eq(stores.id, result));
    }
  });

  it('rolls back the new store and its dependent rows if setup fails', async () => {
    let newStoreId = '';
    await expect(
      transaction.runForNewStore(async (storeId) => {
        newStoreId = storeId;
        await database.forStore(storeId, (tx) =>
          tx.insert(stores).values({ id: storeId, name: 'Failed store' }),
        );
        await repository.insert(storeId, { name: 'Sumi', phone: '01711000012' });
        throw new Error('Setup failed');
      }),
    ).rejects.toThrow('Setup failed');

    expect(
      await admin.db.select({ id: stores.id }).from(stores).where(eq(stores.id, newStoreId)),
    ).toEqual([]);
    expect(await customerWithPhone(newStoreId, '01711000012')).toEqual([]);
  });

  function customerWithPhone(storeId: string, phone: string) {
    return admin.db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.storeId, storeId), eq(customers.phone, phone)));
  }
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set for integration tests`);
  return value;
}
