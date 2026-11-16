import 'reflect-metadata';

import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WalletCreditPreview } from '@dakly/contracts/wallets';
import { createDatabase } from '@dakly/db/client';

import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { StaffTransaction } from '../platform/database/staff-transaction';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { createHttpServer } from '../platform/http/http-server';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { AdminModule } from './admin.module';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffSessionsService } from './staff-sessions.service';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule, AdminModule] })(TestModule);
const database = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeIds: string[] = [],
  staffIds: string[] = [];
let app: NestFastifyApplication;
let key: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function fixture(role: 'support' | 'super_admin' | 'finance' = 'support') {
  const storeId = randomUUID(),
    staffId = randomUUID(),
    email = `${staffId}@example.test`;
  storeIds.push(storeId);
  staffIds.push(staffId);
  await database.pool.query('insert into stores(id,name) values($1,$2)', [storeId, 'রিনার দোকান']);
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
    .setProtectedHeader({ alg: 'RS256', kid: 'wallet-credit' })
    .setIssuer('https://dakly-test.cloudflareaccess.com')
    .setAudience('staff-app')
    .setSubject(staffId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  return {
    storeId,
    staffId,
    headers: {
      host: 'localhost:3010',
      origin: 'http://localhost:3010',
      cookie: `dakly_staff=${token}`,
      'cf-access-jwt-assertion': assertion,
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const request = {
  wallet: 'sms_credits',
  quantity: 500,
  reason: 'Free beta SMS credits for launch',
};

function admin(f: Fixture, path: string, payload: object, storeId = f.storeId) {
  return app.inject({
    method: 'POST',
    url: `/admin/stores/${storeId}/wallet-credits${path}`,
    headers: f.headers,
    remoteAddress: `2001:db8:${randomInt(1, 65535).toString(16)}::1`,
    payload,
  });
}
async function preview(f: Fixture) {
  const response = await admin(f, '/preview', request);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<WalletCreditPreview>();
}
function confirm(f: Fixture, previewed: WalletCreditPreview, storeId = f.storeId) {
  return admin(f, '', { ...previewed, confirmed: true }, storeId);
}
async function recorded(storeId: string) {
  return (
    await database.pool.query(
      "select (select count(*)::int from wallet_ledger where store_id=$1) ledger,(select count(*)::int from staff_audit_log where store_id=$1 and action='wallet.credited') staff_audits,(select count(*)::int from audit_log where store_id=$1 and action='wallet.credited') shop_audits",
      [storeId],
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
    JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'wallet-credit' }] }),
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
  for (const table of ['wallet_ledger', 'audit_log'])
    await database.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [storeIds]);
  for (const table of [
    'staff_identity_contacts',
    'staff_user_links',
    'staff_audit_log',
    'staff_sessions',
  ])
    await database.pool.query(`delete from ${table} where staff_user_id=any($1::uuid[])`, [
      staffIds,
    ]);
  await database.pool.query('delete from stores where id=any($1::uuid[])', [storeIds]);
  await database.pool.query('delete from staff_users where id=any($1::uuid[])', [staffIds]);
  await database.pool.end();
  await app?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Staff wallet credits over Fastify and Postgres', () => {
  it('credits once after the confirmed preview and records the staff audit first', async () => {
    const f = await fixture();
    const previewed = await preview(f);
    expect(previewed.effect).toMatchObject({
      ...request,
      storeId: f.storeId,
      shopName: 'রিনার দোকান',
    });
    expect(await recorded(f.storeId)).toEqual({ ledger: 0, staff_audits: 0, shop_audits: 0 });

    const response = await confirm(f, previewed);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ wallet: 'sms_credits', balanceQuantity: 500 });
    const again = await confirm(f, previewed);
    expect(again.json()).toEqual(response.json());
    expect(await recorded(f.storeId)).toEqual({ ledger: 1, staff_audits: 1, shop_audits: 1 });
    const row = (
      await database.pool.query(
        'select l.kind,l.quantity_delta::int as delta,l.actor_type,l.actor_staff_id,a.reason from wallet_ledger l join staff_audit_log a on a.id=l.reference_id where l.id=$1',
        [response.json().id],
      )
    ).rows[0];
    expect(row).toEqual({
      kind: 'adjustment',
      delta: 500,
      actor_type: 'staff',
      actor_staff_id: f.staffId,
      reason: request.reason,
    });
  });

  it('lets a super admin credit and refuses other staff roles', async () => {
    const superAdmin = await fixture('super_admin');
    expect((await confirm(superAdmin, await preview(superAdmin))).statusCode).toBe(201);
    const finance = await fixture('finance');
    expect((await admin(finance, '/preview', request)).statusCode).toBe(403);
  });

  it('refuses an altered effect, another store and an expired confirmation', async () => {
    const f = await fixture(),
      other = await fixture();
    const previewed = await preview(f);
    const altered = { ...previewed, effect: { ...previewed.effect, quantity: 50000 } };
    expect((await confirm(f, altered)).statusCode).toBe(400);
    expect((await confirm(f, previewed, other.storeId)).statusCode).toBe(400);
    expect((await admin(f, '/preview', { ...request, reason: 'short' })).statusCode).toBe(400);
    const later = vi.spyOn(Clock.prototype, 'now').mockReturnValue(new Date(Date.now() + 301_000));
    expect((await confirm(f, previewed)).statusCode).toBe(400);
    later.mockRestore();
    expect(await recorded(f.storeId)).toEqual({ ledger: 0, staff_audits: 0, shop_audits: 0 });
  });

  it('changes nothing when either audit write fails', async () => {
    const f = await fixture();
    for (const [service, method] of [
      [app.get(StaffAuditRepository), 'recordForStore'],
      [app.get(AuditService), 'record'],
    ] as const) {
      const spy = vi
        .spyOn(service as AuditService, method as 'record')
        .mockRejectedValueOnce(new Error('Audit unavailable'));
      expect((await confirm(f, await preview(f))).statusCode).toBe(500);
      spy.mockRestore();
      expect(await recorded(f.storeId)).toEqual({ ledger: 0, staff_audits: 0, shop_audits: 0 });
    }
  });
});
