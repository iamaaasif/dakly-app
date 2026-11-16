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
const approval = { reason: 'Operator approved the masking name' };

async function staff(role: 'support' | 'finance' = 'support') {
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
    .setProtectedHeader({ alg: 'RS256', kid: 'sms-sender-review' })
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

async function requestedSender() {
  const storeId = randomUUID();
  storeIds.push(storeId);
  await database.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'রিনার দোকান']);
  const id = (
    await database.pool.query(
      "insert into sms_sender_ids(id,store_id,sender_name) values(gen_random_uuid(),$1,'Rina Shop') returning id",
      [storeId],
    )
  ).rows[0].id as string;
  return { storeId, id };
}

function decide(headers: Headers, url: string, payload: object = approval) {
  return app.inject({
    method: 'POST',
    url,
    headers,
    remoteAddress: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
    payload,
  });
}

async function recorded(id: string) {
  return (
    await database.pool.query(
      "select s.status,s.rejection_reason,(select count(*)::int from staff_audit_log where target_id=s.id and target_type='sms_sender_id') staff_audits,(select count(*)::int from audit_log where entity_id=s.id) shop_audits from sms_sender_ids s where s.id=$1",
      [id],
    )
  ).rows[0];
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
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'sms-sender-review' }] }),
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
  for (const table of ['sms_sender_ids', 'audit_log'])
    await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
  for (const table of ['staff_audit_log', 'staff_sessions'])
    await database.pool.query(`delete from ${table} where staff_user_id=any($1::uuid[])`, [
      staffIds,
    ]);
  await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await database.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await database.pool.end();
  await app?.close();
  vi.unstubAllEnvs();
});

describe('Staff review of SMS sender names over Fastify and Postgres', () => {
  it('lists the pending request with its store', async () => {
    const headers = await staff();
    const { storeId, id } = await requestedSender();

    const response = await app.inject({
      method: 'GET',
      url: '/admin/sms-sender-ids?limit=100',
      headers,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().items).toContainEqual(
      expect.objectContaining({ id, storeId, storeName: 'রিনার দোকান', status: 'requested' }),
    );
  });

  it('approves once and writes the staff audit row with the reason', async () => {
    const headers = await staff();
    const { storeId, id } = await requestedSender();
    const url = `/admin/stores/${storeId}/sms-sender-ids/${id}/approve`;

    const response = await decide(headers, url);
    const again = await decide(headers, url);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ id, status: 'approved', rejectionReason: null });
    expect(again.json().error.code).toBe('SMS_SENDER_ID_ALREADY_DECIDED');
    expect(await recorded(id)).toEqual({
      status: 'approved',
      rejection_reason: null,
      staff_audits: 1,
      shop_audits: 1,
    });
    const audit = await database.pool.query(
      'select action,reason,store_id from staff_audit_log where target_id=$1',
      [id],
    );
    expect(audit.rows).toEqual([
      { action: 'sms_sender_id.approved', reason: approval.reason, store_id: storeId },
    ]);
  });

  it('rejects with a reason the shop can read', async () => {
    const headers = await staff();
    const { storeId, id } = await requestedSender();
    const reason = 'The trade licence name does not match Rina Shop';

    const response = await decide(headers, `/admin/stores/${storeId}/sms-sender-ids/${id}/reject`, {
      reason,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(await recorded(id)).toEqual({
      status: 'rejected',
      rejection_reason: reason,
      staff_audits: 1,
      shop_audits: 1,
    });
  });

  it('changes nothing for another store, a short reason or a role without review access', async () => {
    const headers = await staff();
    const { storeId, id } = await requestedSender();
    const other = await requestedSender();
    const missing = await decide(
      headers,
      `/admin/stores/${other.storeId}/sms-sender-ids/${id}/approve`,
    );
    const short = await decide(headers, `/admin/stores/${storeId}/sms-sender-ids/${id}/approve`, {
      reason: 'ok',
    });
    const finance = await decide(
      await staff('finance'),
      `/admin/stores/${storeId}/sms-sender-ids/${id}/approve`,
    );

    expect(missing.json().error.code).toBe('SMS_SENDER_ID_NOT_FOUND');
    expect([short.statusCode, finance.statusCode]).toEqual([400, 403]);
    expect(await recorded(id)).toEqual({
      status: 'requested',
      rejection_reason: null,
      staff_audits: 0,
      shop_audits: 0,
    });
  });
});
