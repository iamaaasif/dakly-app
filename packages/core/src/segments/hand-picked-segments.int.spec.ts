import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { HandPickedSegmentsService } from './hand-picked-segments.service';
import { SegmentsModule } from './segments.module';
import { SegmentsService } from './segments.service';

class TestModule {}
Module({ imports: [DatabaseModule, SegmentsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const store = randomUUID();
const otherStore = randomUUID();
const userId = randomUUID();
const staff = { kind: 'user', userId } as const;
const ids = {
  rina: randomUUID(),
  karim: randomUUID(),
  nusrat: randomUUID(),
  foreign: randomUUID(),
};
let app: INestApplicationContext;
let handPicked: HandPickedSegmentsService;
let segments: SegmentsService;

async function members(segmentId: string) {
  return (await segments.contactIds(store, segmentId, { limit: 100 })).sort();
}

describe('HandPickedSegmentsService (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query("insert into stores(id,name) values($1,'Pick shop'),($2,'Other shop')", [
      store,
      otherStore,
    ]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'Staff',$1::text || '@example.test')",
      [userId],
    );
    for (const [name, id] of Object.entries(ids))
      await admin.pool.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,$3,'manual','customer')",
        [id, name === 'foreign' ? otherStore : store, name],
      );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    handPicked = app.get(HandPickedSegmentsService);
    segments = app.get(SegmentsService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of ['outbox_events', 'segments', 'contacts'])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          [store, otherStore],
        ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[store, otherStore]]);
      await admin.pool.query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('makes a segment of the picked customers and never reaches another shop', async () => {
    const segment = await handPicked.createFrom(
      store,
      { name: 'Eid picks', contactIds: [ids.rina, ids.foreign] },
      staff,
    );
    expect(await members(segment.id)).toEqual([ids.rina]);
  });

  it('keeps an unnamed selection out of the list unless asked for by id, and lets names repeat', async () => {
    const first = await handPicked.createFrom(store, { contactIds: [ids.rina] }, staff);
    const second = await handPicked.createFrom(store, { contactIds: [ids.karim] }, staff);
    const listed = async (include: string[] = []) =>
      (await segments.list(store, { status: 'all', limit: 100, include })).items.map(
        (item) => item.id,
      );

    expect(first.name).toBe(second.name);
    expect(await listed()).not.toContain(first.id);
    expect(await listed([first.id])).toContain(first.id);
    expect(await listed([first.id])).not.toContain(second.id);
    expect(await members(first.id)).toEqual([ids.rina]);
    expect((await segments.tabCounts(store)).all).toBe((await listed()).length);
  });

  it('refuses a selection with no customer of this shop', async () => {
    await expect(
      handPicked.createFrom(store, { name: 'Strangers', contactIds: [ids.foreign] }, staff),
    ).rejects.toMatchObject({ code: 'SEGMENT_NO_CUSTOMERS' });
  });

  it('adds only new customers, and Undo removes only those', async () => {
    const segment = await handPicked.createFrom(
      store,
      { name: 'Second picks', contactIds: [ids.rina] },
      staff,
    );
    const added = await handPicked.add(store, segment.id, [ids.rina, ids.karim], staff);
    expect(added.changedIds).toEqual([ids.karim]);
    expect(await members(segment.id)).toEqual([ids.karim, ids.rina].sort());

    await handPicked.remove(store, segment.id, added.changedIds, staff);
    expect(await members(segment.id)).toEqual([ids.rina]);
  });

  it('refuses to add to a segment built from rules', async () => {
    const byRules = await segments.create(
      store,
      {
        name: 'By rules',
        rules: {
          match: 'all',
          conditions: [{ field: 'source', operator: 'is_any_of', values: ['manual'] }],
        },
      },
      staff,
    );
    await expect(handPicked.add(store, byRules.id, [ids.nusrat], staff)).rejects.toMatchObject({
      code: 'SEGMENT_NOT_HAND_PICKED',
    });
  });

  it('keeps at least one customer', async () => {
    const segment = await handPicked.createFrom(
      store,
      { name: 'Single', contactIds: [ids.nusrat] },
      staff,
    );
    await expect(handPicked.remove(store, segment.id, [ids.nusrat], staff)).rejects.toMatchObject({
      code: 'SEGMENT_HAND_PICKED_EMPTY',
    });
  });
});
