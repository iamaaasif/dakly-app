import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';

import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { AuthModule } from './auth.module';

class FacebookTestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(FacebookTestModule);

describe('Continue with Facebook over Fastify', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const emails: string[] = [];
  let app: NestFastifyApplication;
  const ip = () => `2001:db8::${randomInt(1, 65535).toString(16)}`;
  const person = () => {
    const email = `${randomUUID()}@example.test`;
    emails.push(email);
    return { id: String(randomInt(10 ** 9, 10 ** 12)), name: 'Rina', email };
  };
  const codeFor = (profile: object) => `fake-facebook:${JSON.stringify(profile)}`;
  async function start(query = 'termsVersion=2026-11') {
    const response = await app.inject({
      url: `/auth/facebook/start?${query}`,
      remoteAddress: ip(),
    });
    const cookie = response.cookies.find((item) => item.name === 'dakly_facebook_state')!;
    const state = new URL(response.headers.location as string).searchParams.get('state')!;
    return { response, cookie: `${cookie.name}=${cookie.value}`, state };
  }
  async function comeBack(profile: object, query?: string) {
    const { cookie, state } = await start(query);
    return app.inject({
      url: `/auth/facebook/callback?code=${encodeURIComponent(codeFor(profile))}&state=${state}`,
      headers: { cookie },
      remoteAddress: ip(),
    });
  }
  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      FacebookTestModule,
      new FastifyAdapter(),
      { logger: false },
    );
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    const rows = await admin.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.email, emails));
    const ids = rows.map((row) => row.id);
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      ids,
    ]);
    await admin.db.delete(sessions).where(inArray(sessions.userId, ids));
    await admin.db.delete(users).where(inArray(users.id, ids));
    await app?.close();
    await admin.pool.end();
  });

  it('creates an account with the Facebook email, then signs the same person in again', async () => {
    const profile = person();
    const created = await comeBack(profile);
    expect(created.statusCode).toBe(302);
    expect(created.headers.location).toBe('/setup');
    expect(created.cookies.some((item) => item.name === 'dakly_session')).toBe(true);
    const [user] = await admin.db.select().from(users).where(eq(users.email, profile.email));
    expect(user).toMatchObject({ facebookSubject: profile.id, name: 'Rina', phone: null });
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    const again = await comeBack(profile, '');
    expect(again.headers.location).toBe('/dashboard');
  });

  it('links an existing account that has the same verified email without creating another', async () => {
    const profile = person();
    const [existing] = await admin.db
      .insert(users)
      .values({ name: 'Rina', email: profile.email, emailVerifiedAt: new Date() })
      .returning();
    const response = await comeBack(profile, '');
    expect(response.headers.location).toBe('/dashboard');
    const rows = await admin.db.select().from(users).where(eq(users.email, profile.email));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: existing!.id, facebookSubject: profile.id });
  });

  it('sends a new person without accepted terms back to sign-in', async () => {
    const response = await comeBack(person(), '');
    expect(response.headers.location).toBe('/sign-in?facebook=terms_required');
  });

  it('refuses a return that did not start in this browser', async () => {
    const { state } = await start();
    const response = await app.inject({
      url: `/auth/facebook/callback?code=${encodeURIComponent(codeFor(person()))}&state=${state}`,
      headers: { cookie: 'dakly_facebook_state=someone-else' },
      remoteAddress: ip(),
    });
    expect(response.headers.location).toBe('/sign-in?facebook=expired');
    expect(response.cookies.some((item) => item.name === 'dakly_session')).toBe(false);
  });

  it('treats Cancel on Facebook as a normal return to sign-in', async () => {
    const response = await app.inject({ url: '/auth/facebook/callback?error=access_denied' });
    expect(response.headers.location).toBe('/sign-in?facebook=cancelled');
  });
});
