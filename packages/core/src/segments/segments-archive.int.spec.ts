import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SegmentRules } from '@dakly/contracts/segments';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsModule } from './segments.module';
import { SegmentsService } from './segments.service';

class TestModule {}
Module({ imports: [DatabaseModule, SegmentsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const userId = randomUUID();
const staff = { kind: 'user', userId } as const;
const vip: SegmentRules = {
  match: 'all',
  conditions: [{ field: 'tag', operator: 'is_any_of', values: ['vip'] }],
};
let app: INestApplicationContext;
let service: SegmentsService;

async function seedContact(storeId: string, name: string, tags: string[]) {
  await admin.pool.query(
    "insert into contacts(id,store_id,name,source,kind,tags) values(gen_random_uuid(),$1,$2,'manual','customer',$3)",
    [storeId, name, tags],
  );
}

describe('segment archive, status filter, search and counts (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeA, storeB],
    );
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'নুসরাত',$1::text || '@example.test')",
      [userId],
    );
    await seedContact(storeA, 'রিনা', ['vip']);
    await seedContact(storeA, 'করিম', ['vip']);
    await seedContact(storeB, 'অন্য দোকান', ['vip']);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(SegmentsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'segments', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          [storeA, storeB],
        ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[storeA, storeB]]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('archives, filters by status, searches by name and counts the tabs', async () => {
    const eid = await service.create(storeA, { name: 'Eid VIP', rules: vip }, staff);
    const winter = await service.create(storeA, { name: 'Winter 50%', rules: vip }, staff);
    await service.create(storeA, { name: 'Winter all', rules: vip }, staff);
    await service.create(storeB, { name: 'Other shop', rules: vip }, staff);

    const archived = await service.archive(storeA, eid.id);
    expect(archived.archivedAt).not.toBeNull();
    const again = await service.archive(storeA, eid.id);
    expect(again.archivedAt).toBe(archived.archivedAt);

    expect(await service.tabCounts(storeA)).toEqual({ all: 3, active: 2, archived: 1 });
    expect(await service.tabCounts(storeB)).toEqual({ all: 1, active: 1, archived: 0 });

    const names = async (status: 'all' | 'active' | 'archived', search?: string) =>
      (await service.list(storeA, { status, search, limit: 50 })).items.map((i) => i.name).sort();
    expect(await names('all')).toEqual(['Eid VIP', 'Winter 50%', 'Winter all']);
    expect(await names('active')).toEqual(['Winter 50%', 'Winter all']);
    expect(await names('archived')).toEqual(['Eid VIP']);
    expect(await names('all', 'winter')).toEqual(['Winter 50%', 'Winter all']);
    expect(await names('all', '50%')).toEqual(['Winter 50%']);
    expect(await names('active', 'eid')).toEqual([]);

    const listed = await service.list(storeA, { status: 'all', limit: 50 });
    expect(listed.items.every((item) => item.contactCount === 2)).toBe(true);

    const restored = await service.unarchive(storeA, eid.id);
    expect(restored.archivedAt).toBeNull();
    expect(await service.tabCounts(storeA)).toEqual({ all: 3, active: 3, archived: 0 });
    expect(winter.archivedAt).toBeNull();
  });

  it('refuses another store’s segment and an unknown one', async () => {
    const other = await service.create(storeB, { name: 'Private', rules: vip }, staff);
    await expect(service.archive(storeA, other.id)).rejects.toMatchObject({
      code: 'SEGMENT_NOT_FOUND',
    });
    await expect(service.unarchive(storeA, randomUUID())).rejects.toMatchObject({
      code: 'SEGMENT_NOT_FOUND',
    });
    expect((await service.list(storeB, { status: 'archived', limit: 50 })).items).toEqual([]);
    await service.assertNotArchived(storeA, { includeSegmentIds: [other.id] });
  });

  it('refuses an archived segment for a campaign and ignores other segments', async () => {
    const old = await service.create(storeA, { name: 'Old list', rules: vip }, staff);
    const live = await service.create(storeA, { name: 'Live list', rules: vip }, staff);
    await service.archive(storeA, old.id);
    await service.assertNotArchived(storeA, { includeSegmentIds: [live.id, randomUUID()] });
    await expect(
      service.assertNotArchived(storeA, {
        includeSegmentIds: [live.id],
        excludeSegmentIds: [old.id],
      }),
    ).rejects.toMatchObject({
      code: 'SEGMENT_ARCHIVED',
    });
  });
});
