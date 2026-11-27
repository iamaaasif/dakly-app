import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LifecycleStage } from '@dakly/contracts/contacts';
import { createDatabase } from '@dakly/db/client';
import { contacts, contactStats } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';

import { TenantDatabase } from '../platform/database/tenant-database';
import { type ContactFilter, ContactListRepository } from './contact-list.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

type Seed = {
  name: string;
  stage: LifecycleStage;
  orders: number;
  spend: number;
  lastOrderDaysAgo: number;
  source?: 'shopify' | 'manual' | 'messenger';
  email?: string;
  district?: string;
};

// Ten customers, so the top 10% is exactly the biggest spender.
const seeds: Seed[] = [
  {
    name: 'Mim',
    stage: 'best',
    orders: 14,
    spend: 5_200_000,
    lastOrderDaysAgo: 2,
    source: 'shopify',
    email: 'mim@example.com',
    district: 'Dhaka',
  },
  {
    name: 'Nusrat',
    stage: 'regulars',
    orders: 5,
    spend: 1_100_000,
    lastOrderDaysAgo: 20,
    source: 'shopify',
  },
  {
    name: 'Rakib',
    stage: 'new',
    orders: 1,
    spend: 189_000,
    lastOrderDaysAgo: 5,
    source: 'messenger',
  },
  { name: 'Sadia', stage: 'new', orders: 1, spend: 145_000, lastOrderDaysAgo: 40 },
  { name: 'Tanvir', stage: 'slipping_away', orders: 6, spend: 700_000, lastOrderDaysAgo: 80 },
  {
    name: 'Ayesha',
    stage: 'stopped_buying',
    orders: 3,
    spend: 900_000,
    lastOrderDaysAgo: 200,
    district: 'Gulshan',
  },
  { name: 'Farhan', stage: 'bought_once', orders: 1, spend: 100_000, lastOrderDaysAgo: 60 },
  { name: 'Hena', stage: 'regulars', orders: 4, spend: 600_000, lastOrderDaysAgo: 10 },
  { name: 'Imran', stage: 'regulars', orders: 2, spend: 300_000, lastOrderDaysAgo: 15 },
  { name: 'Juthi', stage: 'regulars', orders: 3, spend: 400_000, lastOrderDaysAgo: 25 },
];

describe('ContactListRepository (Postgres)', () => {
  const admin = createDatabase(requireEnv('DATABASE_ADMIN_URL'));
  const app = createDatabase(requireEnv('DATABASE_URL'));
  const repository = new ContactListRepository(new TenantDatabase(app.db));
  let storeId: string;
  let otherStoreId: string;

  beforeAll(async () => {
    const created = await admin.db
      .insert(stores)
      .values([{ name: 'List shop' }, { name: 'Other shop' }])
      .returning({ id: stores.id });
    storeId = created[0]!.id;
    otherStoreId = created[1]!.id;
    for (const [index, seed] of seeds.entries()) {
      const [contact] = await admin.db
        .insert(contacts)
        .values({
          storeId,
          name: seed.name,
          phone: `0171100${String(index).padStart(4, '0')}`,
          kind: 'customer',
          source: seed.source ?? 'manual',
          email: seed.email,
          district: seed.district,
          createdAt: daysAgo(300 - index),
        })
        .returning({ id: contacts.id });
      await admin.db.insert(contactStats).values({
        storeId,
        contactId: contact!.id,
        ordersCount: seed.orders,
        netSpendPoisha: seed.spend,
        lastOrderAt: daysAgo(seed.lastOrderDaysAgo),
        lifecycleStage: seed.stage,
      });
    }
    // A lead with no orders and no stats row, and a customer of another shop with big spend.
    await admin.db
      .insert(contacts)
      .values({ storeId, name: 'Lead Lina', kind: 'lead', source: 'messenger' });
    const [stranger] = await admin.db
      .insert(contacts)
      .values({
        storeId: otherStoreId,
        name: 'Stranger',
        phone: '01799999999',
        kind: 'customer',
        source: 'manual',
      })
      .returning({ id: contacts.id });
    await admin.db.insert(contactStats).values({
      storeId: otherStoreId,
      contactId: stranger!.id,
      ordersCount: 99,
      netSpendPoisha: 99_000_000,
      lifecycleStage: 'best',
    });
  });

  afterAll(async () => {
    for (const table of ['contact_stats', 'contacts'])
      await admin.db.execute(
        sql`delete from ${sql.raw(table)} where store_id in (${storeId}, ${otherStoreId})`,
      );
    await admin.db.execute(sql`delete from stores where id in (${storeId}, ${otherStoreId})`);
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  const names = async (filter: Partial<ContactFilter>) =>
    (await repository.list(storeId, { limit: 50, ...filter })).map((row) => row.name);

  it('maps each tab to its lifecycle stage', async () => {
    expect(await names({ type: 'new', sort: 'name' })).toEqual(['Rakib', 'Sadia']);
    expect(await names({ type: 'returning', sort: 'name' })).toEqual([
      'Hena',
      'Imran',
      'Juthi',
      'Nusrat',
    ]);
    expect(await names({ type: 'vip' })).toEqual(['Mim']);
    expect(await names({ type: 'inactive' })).toEqual(['Ayesha']);
    expect(await names({ type: 'at_risk' })).toEqual(['Tanvir']);
  });

  it('treats the top 10% by net spend as high value whatever the stage', async () => {
    expect(await names({ type: 'high_value' })).toEqual(['Mim']);
    const [top] = await repository.list(storeId, { limit: 1, sort: 'highest_spend' });
    expect(top).toMatchObject({ name: 'Mim', isHighValue: true, lifecycleStage: 'best' });
    const [other] = await repository.list(storeId, { limit: 1, name: 'Nusrat' });
    expect(other).toMatchObject({ isHighValue: false });
  });

  it('counts the tabs for this shop only', async () => {
    expect(await repository.counts(storeId)).toEqual({
      all: 11,
      new: 2,
      returning: 4,
      vip: 1,
      inactive: 1,
      atRisk: 1,
      highValue: 1,
      boughtMoreThanOnce: 7,
      canReceiveMarketing: 0,
    });
  });

  it('filters by source, spend range and last purchase window', async () => {
    expect(await names({ source: 'messenger', sort: 'name' })).toEqual(['Lead Lina', 'Rakib']);
    expect(await names({ minSpendPoisha: 600_000, maxSpendPoisha: 900_000, sort: 'name' })).toEqual(
      ['Ayesha', 'Hena', 'Tanvir'],
    );
    expect(await names({ lastPurchase: '7_days', sort: 'name' })).toEqual(['Mim', 'Rakib']);
    expect(await names({ lastPurchase: '30_days', sort: 'name' })).toEqual([
      'Hena',
      'Imran',
      'Juthi',
      'Mim',
      'Nusrat',
      'Rakib',
    ]);
    expect(await names({ lastPurchase: 'over_90_days' })).toEqual(['Ayesha']);
    expect(await names({ lastPurchase: 'never' })).toEqual(['Lead Lina']);
  });

  it('finds a text in the name, the email or the area when asked to', async () => {
    expect(await names({ name: 'gulsh' })).toEqual([]);
    expect(await names({ name: 'gulsh', matchEmailAndArea: true })).toEqual(['Ayesha']);
    expect(await names({ name: 'mim@example', matchEmailAndArea: true })).toEqual(['Mim']);
  });

  it('sorts by each key and pages without repeating or skipping a contact', async () => {
    const firstThree = {
      highest_spend: ['Mim', 'Nusrat', 'Ayesha'],
      most_orders: ['Mim', 'Tanvir', 'Nusrat'],
      last_purchase: ['Mim', 'Rakib', 'Hena'],
      name: ['Ayesha', 'Farhan', 'Hena'],
    } as const;
    for (const [sort, expected] of Object.entries(firstThree)) {
      const key = sort as keyof typeof firstThree;
      const seen: string[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await repository.list(storeId, { limit: 4, sort: key, cursor });
        seen.push(...page.slice(0, 4).map((row) => row.name!));
        if (page.length <= 4) break;
        cursor = page[3]!.id;
      }
      expect(seen.slice(0, 3)).toEqual(expected);
      expect(new Set(seen).size).toBe(11);
    }
  });

  it('counts every match whatever the cursor', async () => {
    const [first] = await repository.list(storeId, { limit: 1 });
    expect(await repository.countListed(storeId, { limit: 1, cursor: first!.id })).toBe(11);
    expect(await repository.countListed(storeId, { limit: 1, type: 'returning' })).toBe(4);
  });

  it('reads zero orders and spend for a contact with no stats', async () => {
    const [lina] = await repository.list(storeId, { limit: 1, name: 'Lina' });
    expect(lina).toMatchObject({
      ordersCount: 0,
      netSpendPoisha: 0,
      lastOrderAt: null,
      lifecycleStage: 'none',
      isHighValue: false,
    });
  });
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for integration tests`);
  return value;
}
