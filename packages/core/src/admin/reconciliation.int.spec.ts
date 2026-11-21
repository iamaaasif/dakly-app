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
    .setProtectedHeader({ alg: 'RS256', kid: 'reconciliation' })
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

const lineIds: string[] = [];
const close = {
  action: 'gateway_error',
  reason: 'Gateway reported a duplicate line',
  confirmed: true,
};

function request(headers: Headers, method: 'GET' | 'POST', url: string, payload?: object) {
  return app.inject({
    method,
    url,
    headers,
    remoteAddress: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
    payload,
  });
}

async function line(status = 'unmatched') {
  const id = randomUUID();
  lineIds.push(id);
  await database.pool.query(
    "insert into gateway_settlement_lines(id,gateway,settlement_date,gateway_transaction_id,amount_poisha,status) values($1::uuid,'bkash','2026-11-20',$1::text,149000,$2)",
    [id, status],
  );
  return id;
}

async function statusOf(id: string) {
  const rows = await database.pool.query(
    'select status, note from gateway_settlement_lines where id=$1',
    [id],
  );
  return rows.rows[0] as { status: string; note: string | null };
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
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'reconciliation' }] }),
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
  await database.pool.query('delete from gateway_settlement_lines where id=any($1::uuid[])', [
    lineIds,
  ]);
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

describe('Staff reconciliation queue over Fastify and Postgres', () => {
  it('lists open lines and closes one with an audit row', async () => {
    const headers = await staff();
    const open = await line();
    const matched = await line('matched');

    const list = await request(headers, 'GET', '/admin/reconciliation');
    const ids = list.json().lines.map((row: { id: string }) => row.id);
    expect(ids).toContain(open);
    expect(ids).not.toContain(matched);

    const response = await request(headers, 'POST', `/admin/reconciliation/lines/${open}`, close);
    expect(response.statusCode, response.body).toBe(201);
    expect(await statusOf(open)).toEqual({ status: 'gateway_error', note: close.reason });
    const audit = await database.pool.query(
      'select 1 from staff_audit_log where target_id=$1 and action=$2',
      [open, 'settlement_line.gateway_error'],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('escalates a line, which stays open, and refuses a closed line without an audit row', async () => {
    const headers = await staff();
    const id = await line();
    const escalate = { ...close, action: 'escalated' };
    expect(
      (await request(headers, 'POST', `/admin/reconciliation/lines/${id}`, escalate)).statusCode,
    ).toBe(201);
    expect(
      (await request(headers, 'GET', '/admin/reconciliation'))
        .json()
        .lines.map((row: { id: string }) => row.id),
    ).toContain(id);

    const closed = await line('matched');
    const refused = await request(headers, 'POST', `/admin/reconciliation/lines/${closed}`, close);
    expect(refused.statusCode).toBe(409);
    const audit = await database.pool.query('select 1 from staff_audit_log where target_id=$1', [
      closed,
    ]);
    expect(audit.rowCount).toBe(0);
  });

  it('refuses a missing confirmation, an unknown line and the wrong role', async () => {
    const finance = await staff();
    const id = await line();
    const url = `/admin/reconciliation/lines/${id}`;
    expect((await request(finance, 'POST', url, { ...close, confirmed: false })).statusCode).toBe(
      400,
    );
    expect(
      (await request(finance, 'POST', `/admin/reconciliation/lines/${randomUUID()}`, close))
        .statusCode,
    ).toBe(404);
    const ops = await staff('ops');
    expect((await request(ops, 'POST', url, close)).statusCode).toBe(403);
    const analyst = await staff('analyst');
    expect((await request(analyst, 'GET', '/admin/reconciliation')).statusCode).toBe(200);
    expect((await request(analyst, 'POST', url, close)).statusCode).toBe(403);
    expect((await statusOf(id)).status).toBe('unmatched');
  });
});
