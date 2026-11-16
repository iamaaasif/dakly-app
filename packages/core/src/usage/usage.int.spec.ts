import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { UsageModule } from './usage.module';
import { UsageService } from './usage.service';

class TestModule {}
Module({ imports: [DatabaseModule, UsageModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];
let app: INestApplicationContext;
let service: UsageService;

async function member(storeId: string, role: string) {
  const userId = randomUUID();
  userIds.push(userId);
  await admin.pool.query(
    'insert into users(id,name,phone,phone_verified_at) values($1,$2,$3,now())',
    [userId, 'রিনা', `018${randomInt(10000000, 99999999)}`],
  );
  await admin.pool.query(
    "insert into memberships(id,store_id,user_id,built_in_role,status) values(gen_random_uuid(),$1,$2,$3,'active')",
    [storeId, userId, role],
  );
  return userId;
}

async function shop(aiAsk: number) {
  const storeId = randomUUID();
  const planId = randomUUID();
  storeIds.push(storeId);
  planIds.push(planId);
  await admin.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'রিনার দোকান']);
  await admin.pool.query(
    "insert into plans(id,code,name,monthly_price_poisha,yearly_price_poisha,limits,is_public) values($1::uuid,$1::text,'Usage fixture',0,0,$2,false)",
    [planId, { ai_ask: aiAsk, ai_content: 1 }],
  );
  await admin.pool.query(
    "insert into subscriptions(id,store_id,plan_id,status,current_period_price_poisha,current_period_start,current_period_end) values(gen_random_uuid(),$1,$2,'active',0,'2026-11-16T04:00:00Z','2026-12-16T04:00:00Z')",
    [storeId, planId],
  );
  const [owner, manager] = [await member(storeId, 'owner'), await member(storeId, 'admin')];
  await member(storeId, 'marketer');
  return { storeId, recipients: [owner, manager].sort() };
}

async function startNextPeriod(storeId: string) {
  await admin.pool.query(
    "update subscriptions set current_period_start=current_period_end, current_period_end=current_period_end + interval '1 month' where store_id=$1",
    [storeId],
  );
}

async function notices(storeId: string, percent: number) {
  const result = await admin.pool.query<{ user_id: string; dedupe_key: string }>(
    'select user_id, dedupe_key from notifications where store_id=$1 and dedupe_key like $2 order by dedupe_key, user_id',
    [storeId, `usage-${percent}:%`],
  );
  return result.rows;
}

async function usedInStore(storeId: string) {
  const result = await admin.pool.query<{ count: number; total: number }>(
    'select count(*)::int as count, coalesce(sum(quantity),0)::int as total from usage_events where store_id=$1',
    [storeId],
  );
  return result.rows[0];
}

const ask = (reference: string, quantity = 1) => ({
  unit: 'ai_ask' as const,
  quantity,
  reference,
});

describe('UsageService.consume', () => {
  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(UsageService);
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      for (const table of [
        'usage_events',
        'notifications',
        'outbox_events',
        'subscriptions',
        'memberships',
      ])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
      await admin.pool.query('delete from plans where id=any($1::uuid[])', [planIds]);
      await admin.pool.query('delete from users where id=any($1::uuid[])', [userIds]);
      await admin.pool.end();
    }
  });

  it('lets exactly one of two parallel consumes take the last unit', async () => {
    const { storeId } = await shop(3);
    await service.consume(storeId, ask(randomUUID(), 2));
    const results = await Promise.allSettled([
      service.consume(storeId, ask(randomUUID())),
      service.consume(storeId, ask(randomUUID())),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: 'USAGE_ALLOWANCE_EXCEEDED', status: 409 });
    expect(await usedInStore(storeId)).toEqual({ count: 2, total: 3 });
  });

  it('charges a repeated reference once and returns the first result', async () => {
    const { storeId } = await shop(1);
    const first = await service.consume(storeId, ask('ai-run-7'));
    const second = await service.consume(storeId, ask('ai-run-7'));
    expect(second).toEqual(first);
    expect(first).toMatchObject({ unit: 'ai_ask', quantity: 1, source: 'allowance' });
    expect(await usedInStore(storeId)).toEqual({ count: 1, total: 1 });
  });

  it('refuses a consume over the allowance and writes nothing', async () => {
    const { storeId } = await shop(5);
    await expect(service.consume(storeId, ask(randomUUID(), 6))).rejects.toMatchObject({
      code: 'USAGE_ALLOWANCE_EXCEEDED',
    });
    expect(await usedInStore(storeId)).toEqual({ count: 0, total: 0 });
  });

  it('starts a new period at zero', async () => {
    const { storeId } = await shop(2);
    await service.consume(storeId, ask(randomUUID(), 2));
    await expect(service.consume(storeId, ask(randomUUID()))).rejects.toMatchObject({
      code: 'USAGE_ALLOWANCE_EXCEEDED',
    });
    await startNextPeriod(storeId);
    expect(await service.consume(storeId, ask(randomUUID(), 2))).toMatchObject({
      periodStart: '2026-12-16',
    });
  });

  it('sends the 80% notice to billing viewers once per period and again in the next', async () => {
    const { storeId, recipients } = await shop(10);
    await service.consume(storeId, ask(randomUUID(), 7));
    expect(await notices(storeId, 80)).toEqual([]);
    await service.consume(storeId, ask(randomUUID()));
    await service.consume(storeId, ask(randomUUID()));
    const firstPeriod = recipients.map((userId) => ({
      user_id: userId,
      dedupe_key: 'usage-80:ai_ask:2026-11-16',
    }));
    expect(await notices(storeId, 80)).toEqual(firstPeriod);
    expect(await notices(storeId, 100)).toEqual([]);

    await startNextPeriod(storeId);
    await service.consume(storeId, ask(randomUUID(), 9));
    expect(await notices(storeId, 80)).toEqual([
      ...firstPeriod,
      ...recipients.map((userId) => ({
        user_id: userId,
        dedupe_key: 'usage-80:ai_ask:2026-12-16',
      })),
    ]);
  });

  it('sends the 100% notice once when the allowance is used up', async () => {
    const { storeId, recipients } = await shop(10);
    await service.consume(storeId, ask(randomUUID(), 9));
    await service.consume(storeId, ask(randomUUID()));
    await expect(service.consume(storeId, ask(randomUUID()))).rejects.toMatchObject({
      code: 'USAGE_ALLOWANCE_EXCEEDED',
    });
    expect(await notices(storeId, 100)).toEqual(
      recipients.map((userId) => ({ user_id: userId, dedupe_key: 'usage-100:ai_ask:2026-11-16' })),
    );
  });

  it('meters each unit against its own allowance', async () => {
    const { storeId } = await shop(5);
    await service.consume(storeId, { unit: 'ai_content', quantity: 1, reference: 'draft-1' });
    await expect(
      service.consume(storeId, { unit: 'ai_content', quantity: 1, reference: 'draft-2' }),
    ).rejects.toMatchObject({ code: 'USAGE_ALLOWANCE_EXCEEDED' });
    await expect(
      service.consume(storeId, { unit: 'ai_conversation', quantity: 1, reference: 'draft-1' }),
    ).rejects.toMatchObject({ code: 'USAGE_ALLOWANCE_EXCEEDED' });
    expect(await service.consume(storeId, ask('draft-1', 5))).toMatchObject({ quantity: 5 });
  });
});
