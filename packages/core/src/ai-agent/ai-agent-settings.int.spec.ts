import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  defaultAgentAbilities,
  type SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { AiAgentSettingsModule } from './ai-agent-settings.module';
import { AiAgentSettingsService } from './ai-agent-settings.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [];
const userIds: string[] = [];

class TestModule {}
Module({ imports: [DatabaseModule, AiAgentSettingsModule] })(TestModule);

let app: INestApplicationContext;
let settings: AiAgentSettingsService;

beforeAll(async () => {
  app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  settings = app.get(AiAgentSettingsService);
});

afterAll(async () => {
  try {
    await app?.close();
    for (const table of ['audit_log', 'ai_rule_changes', 'ai_agent_settings'])
      await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [storeIds]);
    await admin.pool.query('delete from stores where id = any($1::uuid[])', [storeIds]);
    await admin.pool.query('delete from users where id = any($1::uuid[])', [userIds]);
  } finally {
    await admin.pool.end();
  }
});

async function shop() {
  const storeId = randomUUID();
  const userId = randomUUID();
  storeIds.push(storeId);
  userIds.push(userId);
  await admin.pool.query(
    "insert into stores (id, name, phone, extensions) values ($1, 'Settings test', '01712345678', '{chats}')",
    [storeId],
  );
  await admin.pool.query(
    'insert into users (id, name, phone, phone_verified_at) values ($1, $2, $3, now())',
    [userId, 'Rina', `019${Math.floor(10000000 + Math.random() * 89999999)}`],
  );
  return { storeId, userId };
}

const input = (version: number): SaveAgentSettingsInput => ({
  version,
  isAutoReplyOn: true,
  replyLanguage: 'bn',
  abilities: { ...defaultAgentAbilities, takeOrders: false, followUp: 'off' },
  handoverRules: { damagedOrWrong: true, refundsAndExchanges: false, specialRequests: true },
  returnToAiMinutes: null,
  extraRules: 'No discount on sale items',
});

it('shows defaults and no saved hand-over rules before the first save', async () => {
  const { storeId } = await shop();
  const view = await settings.view(storeId);
  expect(view).toMatchObject({ version: 0, isAutoReplyOn: false, handoverRulesSaved: false });
});

it('saves, bumps the version and refuses a save from a stale version', async () => {
  const { storeId, userId } = await shop();
  const first = await settings.save(storeId, userId, input(0));
  expect(first).toMatchObject({
    version: 1,
    replyLanguage: 'bn',
    handoverRulesSaved: true,
    returnToAiMinutes: null,
  });
  expect(first.abilities.takeOrders).toBe(false);
  const second = await settings.save(storeId, userId, input(1));
  expect(second.version).toBe(2);
  await expect(settings.save(storeId, userId, input(1))).rejects.toMatchObject({
    code: 'AI_AGENT_SETTINGS_CHANGED',
  });
  await expect(settings.save(storeId, userId, input(0))).rejects.toMatchObject({
    code: 'AI_AGENT_SETTINGS_CHANGED',
  });
});

it('keeps one shop out of another shop settings', async () => {
  const one = await shop();
  const other = await shop();
  await settings.save(one.storeId, one.userId, input(0));
  expect((await settings.view(other.storeId)).version).toBe(0);
});

it('records each change for undo and for the audit log', async () => {
  const { storeId, userId } = await shop();
  await settings.save(storeId, userId, input(0));
  const changes = await admin.pool.query(
    'select count(*)::int as n from ai_rule_changes where store_id = $1',
    [storeId],
  );
  const audits = await admin.pool.query(
    "select count(*)::int as n from audit_log where store_id = $1 and action = 'ai_agent.settings_changed'",
    [storeId],
  );
  expect([changes.rows[0].n, audits.rows[0].n]).toEqual([1, 1]);
});
