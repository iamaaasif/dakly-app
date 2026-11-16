import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SegmentCondition, SegmentInnerGroup, SegmentRules } from '@dakly/contracts/segments';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsModule } from './segments.module';
import { SegmentsService } from './segments.service';

class TestModule {}
Module({ imports: [DatabaseModule, SegmentsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const bulkStore = randomUUID();
let app: INestApplicationContext;
let service: SegmentsService;

type Person = {
  name: string;
  district?: string;
  source?: string;
  kind?: string;
  tags?: string[];
  deleted?: boolean;
};

const people: Record<string, Person> = {
  rina: { name: 'রিনা', district: 'ঢাকা', source: 'messenger', tags: ['vip', 'শাড়ি'] },
  karim: { name: 'করিম', district: 'চট্টগ্রাম', source: 'import', tags: ['শাড়ি'] },
  nusrat: { name: 'নুসরাত', source: 'whatsapp', kind: 'lead' },
  supplier: { name: 'সরবরাহকারী', district: 'ঢাকা', kind: 'not_customer', tags: ['vip'] },
  gone: { name: 'মুছে ফেলা', district: 'ঢাকা', tags: ['vip'], deleted: true },
};
const ids: Record<string, string> = {};

async function seed(storeId: string, key: string, person: Person) {
  const id = randomUUID();
  await admin.pool.query(
    `insert into contacts(id,store_id,name,district,source,kind,not_customer_reason,tags,deleted_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      storeId,
      person.name,
      person.district ?? null,
      person.source ?? 'manual',
      person.kind ?? 'customer',
      person.kind === 'not_customer' ? 'supplier' : null,
      person.tags ?? [],
      person.deleted ? new Date('2026-11-01T00:00:00Z') : null,
    ],
  );
  ids[key] = id;
}

async function consent(contactId: string, channel: string, status: string, at: string) {
  await admin.pool.query(
    "insert into consents(id,store_id,contact_id,channel,status,source,captured_at) select gen_random_uuid(),store_id,id,$2,$3,'manual',$4 from contacts where id=$1",
    [contactId, channel, status, at],
  );
}

function all(...conditions: SegmentCondition[]): SegmentInnerGroup {
  return { match: 'all', conditions };
}

// Counts only here; the segment CRUD part checks which contacts match through contactIds.
async function matching(storeId: string, rules: SegmentRules) {
  return (await service.count(storeId, rules)).count;
}

describe('SegmentsService (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান'),($3,'বড় দোকান')",
      [storeA, storeB, bulkStore],
    );
    for (const [key, person] of Object.entries(people)) await seed(storeA, key, person);
    await seed(storeB, 'foreign', { name: 'অন্য দোকানের রিনা', district: 'ঢাকা', tags: ['vip'] });
    await consent(ids.rina!, 'sms', 'granted', '2026-11-01T00:00:00Z');
    await consent(ids.karim!, 'sms', 'granted', '2026-11-01T00:00:00Z');
    await consent(ids.karim!, 'sms', 'withdrawn', '2026-11-02T00:00:00Z');
    await consent(ids.foreign!, 'sms', 'granted', '2026-11-01T00:00:00Z');
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(SegmentsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          [storeA, storeB, bulkStore],
        ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [
        [storeA, storeB, bulkStore],
      ]);
    } finally {
      await admin.pool.end();
    }
    // Removing the 50,000 seeded contacts takes a while on a busy machine.
  }, 60_000);

  it.each([
    ['tag is any of', { field: 'tag', operator: 'is_any_of', values: ['vip'] }, ['rina']],
    [
      'tag is none of',
      { field: 'tag', operator: 'is_none_of', values: ['vip'] },
      ['karim', 'nusrat'],
    ],
    ['district is', { field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }, ['rina']],
    [
      'district is not, keeping contacts with no district',
      { field: 'district', operator: 'is_none_of', values: ['ঢাকা'] },
      ['karim', 'nusrat'],
    ],
    [
      'source is any of',
      { field: 'source', operator: 'is_any_of', values: ['import', 'whatsapp'] },
      ['karim', 'nusrat'],
    ],
    ['kind is', { field: 'kind', operator: 'is_any_of', values: ['lead'] }, ['nusrat']],
    ['kind is not', { field: 'kind', operator: 'is_none_of', values: ['lead'] }, ['karim', 'rina']],
    [
      'consent granted, latest answer wins',
      { field: 'consent', channel: 'sms', granted: true },
      ['rina'],
    ],
    [
      'consent not granted, including no answer',
      { field: 'consent', channel: 'sms', granted: false },
      ['karim', 'nusrat'],
    ],
  ] as const)('matches %s', async (_name, condition, expected) => {
    expect(await matching(storeA, all(condition))).toBe(expected.length);
  });

  it('combines any and all groups', async () => {
    const rules: SegmentRules = {
      match: 'any',
      conditions: [
        all(
          { field: 'tag', operator: 'is_any_of', values: ['শাড়ি'] },
          { field: 'consent', channel: 'sms', granted: false },
        ),
        { field: 'kind', operator: 'is_any_of', values: ['lead'] },
      ],
    };
    expect(await matching(storeA, rules)).toBe(2);
  });

  it('treats a value with SQL characters as a plain value', async () => {
    const values = ["ঢাকা' or 1=1 --", '%', "'); drop table contacts; --"];
    expect(await matching(storeA, all({ field: 'district', operator: 'is_any_of', values }))).toBe(
      0,
    );
    expect(
      (await service.count(storeA, all({ field: 'tag', operator: 'is_any_of', values }))).count,
    ).toBe(0);
  });

  it('never counts another store’s contacts', async () => {
    const dhaka = all({ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] });
    expect((await service.count(storeB, dhaka)).count).toBe(1);
    expect(await matching(storeB, all({ field: 'consent', channel: 'sms', granted: true }))).toBe(
      1,
    );
  });

  it('counts 50,000 contacts in under 2 seconds', async () => {
    await admin.pool.query(
      `insert into contacts(id,store_id,name,district,source,kind,tags)
       select gen_random_uuid(), $1, 'ক্রেতা ' || n, case when n % 4 = 0 then 'ঢাকা' else 'খুলনা' end, 'import',
              'customer', case when n % 10 = 0 then array['vip'] else '{}'::text[] end
       from generate_series(1,50000) n`,
      [bulkStore],
    );
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) select gen_random_uuid(),store_id,id,'sms','granted','import' from contacts where store_id=$1 and name like '%5'",
      [bulkStore],
    );
    await admin.pool.query('analyze contacts; analyze consents');
    const rules: SegmentRules = {
      match: 'any',
      conditions: [
        all(
          { field: 'district', operator: 'is_any_of', values: ['ঢাকা'] },
          { field: 'consent', channel: 'sms', granted: true },
        ),
        { field: 'tag', operator: 'is_any_of', values: ['vip'] },
      ],
    };
    const started = performance.now();
    // n % 4 = 0 and ends in 5 never meet, so this is the 5,000 vip contacts.
    expect((await service.count(bulkStore, rules)).count).toBe(5000);
    expect(performance.now() - started).toBeLessThan(2000);
  }, 60_000);
});
