import 'reflect-metadata';

import { randomBytes, randomInt, randomUUID } from 'node:crypto';

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
const pause = { paused: true, confirmed: true, reason: 'Provider outage under investigation' };

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
    .setProtectedHeader({ alg: 'RS256', kid: 'kill-switches' })
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

async function shop() {
  const storeId = randomUUID();
  storeIds.push(storeId);
  await database.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'রিনার দোকান']);
  return storeId;
}

function put(headers: Headers, url: string, payload: object) {
  return app.inject({
    method: 'PUT',
    url,
    headers,
    remoteAddress: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
    payload,
  });
}

async function paused(feature: string, storeId: string | null) {
  const rows = await database.pool.query(
    'select id from kill_switches where feature=$1 and store_id is not distinct from $2',
    [feature, storeId],
  );
  return rows.rowCount === 1;
}

async function audits(action: string, storeId: string | null) {
  const rows = await database.pool.query(
    'select reason from staff_audit_log where action=$1 and store_id is not distinct from $2',
    [action, storeId],
  );
  return rows.rows.map((row) => row.reason as string);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  vi.stubEnv('ADMIN_ORIGIN', 'http://localhost:3010');
  vi.stubEnv('WEB_ORIGINS', 'http://localhost:3000');
  vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly-test.cloudflareaccess.com');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
  vi.stubEnv(
    'CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS',
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'kill-switches' }] }),
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
  await database.pool.query(
    'delete from kill_switches where store_id=any($1::uuid[]) or feature=$2',
    [storeIds, 'social_posting'],
  );
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

describe('Staff kill switches over Fastify and Postgres', () => {
  it('pauses a feature for every shop with an audit row, then resumes it', async () => {
    const headers = await staff();

    const first = await put(headers, '/admin/kill-switches/social_posting', pause);
    expect(first.statusCode, first.body).toBe(200);
    expect(await paused('social_posting', null)).toBe(true);
    expect(await audits('kill_switch.paused', null)).toContain(pause.reason);

    const again = await put(headers, '/admin/kill-switches/social_posting', pause);
    expect(again.statusCode).toBe(409);

    const resumed = await put(headers, '/admin/kill-switches/social_posting', {
      paused: false,
      confirmed: true,
      reason: 'Provider recovered, checked',
    });
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(await paused('social_posting', null)).toBe(false);
    expect(await audits('kill_switch.resumed', null)).toContain('Provider recovered, checked');
  });

  it('pauses one shop only and records the shop on the audit row', async () => {
    const headers = await staff('super_admin');
    const storeId = await shop();
    const other = await shop();

    const response = await put(
      headers,
      `/admin/stores/${storeId}/kill-switches/campaign_sending`,
      pause,
    );

    expect(response.statusCode, response.body).toBe(200);
    expect(await paused('campaign_sending', storeId)).toBe(true);
    expect(await paused('campaign_sending', other)).toBe(false);
    expect(await audits('kill_switch.paused', storeId)).toEqual([pause.reason]);
  });

  it('refuses resuming a feature that is not paused and leaves no audit row', async () => {
    const headers = await staff();
    const storeId = await shop();

    const response = await put(headers, `/admin/stores/${storeId}/kill-switches/ai_replies`, {
      paused: false,
      confirmed: true,
      reason: 'Resuming something not paused',
    });

    expect(response.statusCode).toBe(409);
    expect(await audits('kill_switch.resumed', storeId)).toEqual([]);
  });

  it('answers 404 for an unknown shop', async () => {
    const response = await put(
      await staff(),
      `/admin/stores/${randomUUID()}/kill-switches/ai_replies`,
      pause,
    );
    expect(response.statusCode).toBe(404);
  });

  it('rejects a missing reason or confirmation', async () => {
    const headers = await staff();
    const url = '/admin/kill-switches/ai_replies';

    expect((await put(headers, url, { ...pause, reason: 'short' })).statusCode).toBe(400);
    expect((await put(headers, url, { paused: true, reason: pause.reason })).statusCode).toBe(400);
    expect(await paused('ai_replies', null)).toBe(false);
  });

  it('lets support see nothing and an analyst only read', async () => {
    const support = await put(await staff('support'), '/admin/kill-switches/ai_replies', pause);
    expect(support.statusCode).toBe(403);

    const analyst = await staff('analyst');
    expect((await put(analyst, '/admin/kill-switches/ai_replies', pause)).statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: '/admin/kill-switches', headers: analyst });
    expect(list.statusCode, list.body).toBe(200);
  });
});
