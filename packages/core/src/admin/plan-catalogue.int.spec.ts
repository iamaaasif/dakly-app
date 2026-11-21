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
const staffIds: string[] = [];
let app: NestFastifyApplication;
let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function staff(role: 'finance' | 'ops' | 'super_admin' | 'analyst' = 'finance') {
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
    .setProtectedHeader({ alg: 'RS256', kid: 'plan-catalogue' })
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

const change = {
  name: 'Starter',
  trialDays: 7,
  monthlyPricePoisha: 159000,
  yearlyPricePoisha: 1590000,
  limits: { customers: 2500, seats: 2, ai_conversation: 300, ai_content: 100, ai_ask: 100 },
  isPublic: true,
  reason: 'Q1 price confirmed with finance',
  confirmed: true,
};

function request(headers: Headers, method: 'GET' | 'PUT', url: string, payload?: object) {
  return app.inject({
    method,
    url,
    headers,
    remoteAddress: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
    payload,
  });
}

async function starter() {
  const rows = await database.pool.query(
    "select name, trial_days, monthly_price_poisha, limits from plans where code='starter'",
  );
  return rows.rows[0] as { name: string; trial_days: number; monthly_price_poisha: string };
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
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'plan-catalogue' }] }),
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
    'update plans set name=\'Starter\', trial_days=14, monthly_price_poisha=149000, yearly_price_poisha=1490000, limits=\'{"customers":2000,"seats":2,"ai_conversation":300,"ai_content":100,"ai_ask":100}\' where code=\'starter\'',
  );
  await database.pool.query('delete from staff_audit_log where staff_user_id=any($1::uuid[])', [
    staffIds,
  ]);
  await database.pool.query('delete from staff_sessions where staff_user_id=any($1::uuid[])', [
    staffIds,
  ]);
  await database.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await database.pool.end();
  await app?.close();
  vi.unstubAllEnvs();
});

describe('Staff plan catalogue over Fastify and Postgres', () => {
  it('lets finance change a plan and writes the audit row with the new values', async () => {
    const headers = await staff();

    const saved = await request(headers, 'PUT', '/admin/plans/starter', change);
    expect(saved.statusCode, saved.body).toBe(200);
    expect(await starter()).toMatchObject({ trial_days: 7, monthly_price_poisha: '159000' });
    const audit = await database.pool.query(
      "select reason, action_details from staff_audit_log where action='plan.updated' and reason=$1",
      [change.reason],
    );
    expect(audit.rows[0].action_details).toMatchObject({ code: 'starter', trialDays: 7 });

    const list = await request(headers, 'GET', '/admin/plans');
    expect(list.json().plans.map((plan: { code: string }) => plan.code)).toContain('starter');
  });

  it('refuses a limit name the plan does not have and changes nothing', async () => {
    const headers = await staff();
    const before = await starter();
    const response = await request(headers, 'PUT', '/admin/plans/starter', {
      ...change,
      limits: { ...change.limits, rockets: 3 },
    });
    expect(response.statusCode).toBe(422);
    expect(await starter()).toEqual(before);
  });

  it('refuses a missing confirmation, an unknown plan and the wrong role', async () => {
    const finance = await staff();
    const noConfirm = await request(finance, 'PUT', '/admin/plans/starter', {
      ...change,
      confirmed: false,
    });
    expect(noConfirm.statusCode).toBe(400);
    const unknown = await request(finance, 'PUT', '/admin/plans/nothing', change);
    expect(unknown.statusCode).toBe(404);
    const ops = await staff('ops');
    expect((await request(ops, 'PUT', '/admin/plans/starter', change)).statusCode).toBe(403);
    expect((await request(ops, 'GET', '/admin/plans')).statusCode).toBe(403);
  });

  it('lets an analyst read the catalogue but not change it', async () => {
    const analyst = await staff('analyst');
    expect((await request(analyst, 'GET', '/admin/plans')).statusCode).toBe(200);
    expect((await request(analyst, 'PUT', '/admin/plans/starter', change)).statusCode).toBe(403);
  });
});
