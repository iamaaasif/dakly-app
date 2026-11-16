import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { automationTemplates } from '@dakly/contracts/automations/templates';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { AutomationsModule } from './automations.module';
import { AutomationsService } from './automations.service';

class TestModule {}
Module({ imports: [DatabaseModule, AutomationsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const userId = randomUUID();
const staff = { kind: 'user', userId } as const;
let app: INestApplicationContext;
let service: AutomationsService;

const welcome: AutomationGraph = automationTemplates.welcome_new_subscriber.graph;
async function draft(graph: AutomationGraph = welcome, storeId = storeA) {
  return service.create(storeId, { name: `স্বাগতম ${randomUUID()}`, graph }, staff);
}

describe('AutomationsService (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeA, storeB],
    );
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'নুসরাত',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(AutomationsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      const stores = [[storeA, storeB]];
      await admin.pool.query('delete from automation_runs where store_id=any($1::uuid[])', stores);
      await admin.pool.query(
        'update automations set published_version_id=null where store_id=any($1::uuid[])',
        stores,
      );
      for (const table of ['automation_versions', 'automations', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, stores);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', stores);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('saves and changes a draft, and archiving removes it from the store', async () => {
    const automation = await draft();
    expect(automation).toMatchObject({ status: 'draft', publishedVersionId: null });

    const changed = await service.change(storeA, automation.id, { name: 'ধন্যবাদ বার্তা' }, staff);
    expect(changed).toMatchObject({ name: 'ধন্যবাদ বার্তা', graph: welcome });
    await service.archive(storeA, automation.id, staff);

    await expect(service.get(storeA, automation.id)).rejects.toMatchObject({
      code: 'AUTOMATION_NOT_FOUND',
    });
    const listed = (await service.list(storeA, { limit: 100 })).items.map((item) => item.id);
    expect(listed).not.toContain(automation.id);
  });

  it('never reads or changes another store’s workflows', async () => {
    const automation = await draft();
    const own = await draft(welcome, storeB);

    for (const attempt of [
      () => service.get(storeB, automation.id),
      () => service.change(storeB, automation.id, { name: 'চুরি' }, staff),
      () => service.archive(storeB, automation.id, staff),
    ])
      await expect(attempt()).rejects.toMatchObject({ code: 'AUTOMATION_NOT_FOUND' });
    const listed = (await service.list(storeB, { limit: 100 })).items.map((item) => item.id);
    expect(listed).toEqual([own.id]);
    expect(await service.get(storeA, automation.id)).toMatchObject({ status: 'draft' });
  });
});
