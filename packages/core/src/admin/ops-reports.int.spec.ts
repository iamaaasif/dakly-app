import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { createHttpServer } from '../platform/http/http-server';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { AdminModule } from './admin.module';
import { StaffSessionsService } from './staff-sessions.service';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule, AdminModule] })(TestModule);
const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [],
  staffIds: string[] = [];
let app: NestFastifyApplication;
let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function staff(role: 'ops' | 'super_admin' | 'support' | 'analyst' = 'ops') {
  const staffId = randomUUID(),
    email = `${staffId}@example.test`;
  staffIds.push(staffId);
  await database.pool.query(
    'insert into staff_users(id,name,email,role,access_subject,enrolled_at) values($1::uuid,$2,$3,$4,$1::text,now())',
    [staffId, 'করিম', email, role],
  );
  const token = await app
    .get(StaffTransaction)
    .run(staffId, () =>
      app.get(StaffSessionsService).issue({ id: staffId, name: 'করিম', role }, '127.0.0.1'),
    );
  const assertion = await new SignJWT({ email, type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'ops-reports' })
    .setIssuer('https://dakly-test.cloudflareaccess.com')
    .setAudience('staff-app')
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  return {
    host: 'localhost:3010',
    origin: 'http://localhost:3010',
    cookie: `dakly_staff=${token}`,
    'cf-access-jwt-assertion': assertion,
  };
}
type Headers = Awaited<ReturnType<typeof staff>>;

async function shopWithRuns(costs: number[], outcome = 'completed') {
  const storeId = randomUUID();
  storeIds.push(storeId);
  await database.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'রিনার দোকান']);
  for (const cost of costs)
    await database.pool.query(
      "insert into ai_runs(id,store_id,purpose,tier,model,prompt_version,cost_micro_usd,outcome,latency_ms) values(gen_random_uuid(),$1,'chat_reply','fast','report-test-model','v1',$2,$3,800)",
      [storeId, cost, outcome],
    );
  return storeId;
}

const get = (headers: Headers, url: string) => app.inject({ method: 'GET', url, headers });

beforeAll(async () => {
  vi.stubEnv('AI_DAILY_STORE_COST_CEILING_MICRO_USD', '5000000');
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  vi.stubEnv('ADMIN_ORIGIN', 'http://localhost:3010');
  vi.stubEnv('WEB_ORIGINS', 'http://localhost:3000');
  vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly-test.cloudflareaccess.com');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
  vi.stubEnv(
    'CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS',
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'ops-reports' }] }),
  );
  vi.stubEnv('STAFF_SESSION_SIGNING_KEY', randomBytes(32).toString('base64'));
  app = await NestFactory.create<NestFastifyApplication>(
    TestModule,
    new FastifyAdapter(createHttpServer([])),
    { logger: false, abortOnError: false },
  );
  await registerSessionCookies(app);
  app.useGlobalFilters(new AppErrorFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await database.pool.query('delete from ai_runs where store_id=any($1::uuid[])', [storeIds]);
  await database.pool.query('delete from staff_audit_log where staff_user_id=any($1::uuid[])', [
    staffIds,
  ]);
  await database.pool.query('delete from staff_sessions where staff_user_id=any($1::uuid[])', [
    staffIds,
  ]);
  await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await database.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await database.pool.end();
  await app?.close();
  vi.unstubAllEnvs();
});

describe('Staff AI cost and provider health reads over Fastify and Postgres', () => {
  it('ranks shops by AI cost today and flags the one over the ceiling', async () => {
    const heavy = await shopWithRuns([3_000_000, 3_500_000]);
    const light = await shopWithRuns([100_000]);

    const response = await get(await staff('finance'), '/admin/ai-cost');

    expect(response.statusCode, response.body).toBe(200);
    const shops = response.json().shops as {
      storeId: string;
      costMicroUsd: number;
      overCeiling: boolean;
    }[];
    expect(shops.find((shop) => shop.storeId === heavy)).toMatchObject({
      costMicroUsd: 6_500_000,
      overCeiling: true,
    });
    expect(shops.find((shop) => shop.storeId === light)).toMatchObject({
      costMicroUsd: 100_000,
      overCeiling: false,
    });
    expect(shops.findIndex((shop) => shop.storeId === heavy)).toBeLessThan(
      shops.findIndex((shop) => shop.storeId === light),
    );
  });

  it('counts failed and timed out AI runs in the provider error rate', async () => {
    await shopWithRuns([10, 10], 'failed');
    await shopWithRuns([10], 'timeout');
    await shopWithRuns([10], 'completed');

    const response = await get(await staff('ops'), '/admin/provider-health');

    expect(response.statusCode, response.body).toBe(200);
    const row = (response.json().providers as { provider: string }[]).find(
      (provider) => provider.provider === 'ai:report-test-model',
    );
    expect(row).toMatchObject({
      hourAttempts: 7,
      hourFailures: 3,
      dayAttempts: 7,
      dayFailures: 3,
      averageLatencyMsLastHour: 800,
    });
  });

  it('keeps support out of both reads and rejects a malformed day', async () => {
    const support = await staff('support');
    expect((await get(support, '/admin/provider-health')).statusCode).toBe(403);
    expect((await get(support, '/admin/ai-cost')).statusCode).toBe(403);
    expect((await get(await staff('ops'), '/admin/ai-cost?day=tomorrow')).statusCode).toBe(400);
  });
});
