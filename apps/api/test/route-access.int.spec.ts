import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadEnv } from '@dakly/core/platform/config/env';
import { createHttpServer } from '@dakly/core/platform/http/http-server';
import { registerSessionCookies } from '@dakly/core/platform/http/session-cookie';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { assertRouteAccess } from './route-access';
import { captureRequestLogs } from './request-log-sink';

describe('API route access rules', () => {
  let app: NestFastifyApplication;
  let logs: ReturnType<typeof captureRequestLogs>;
  beforeEach(() => logs.beginTest());

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(createHttpServer(loadEnv().API_TRUSTED_PROXIES)),
      {
        logger: false,
      },
    );
    logs = captureRequestLogs(app);
    await registerSessionCookies(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      logs?.restore();
    }
  });

  it('keeps health public and shop sessions protected with the bootstrap HTTP server', async () => {
    const headers = {
      host: 'api.example.test',
      'x-forwarded-for': '203.0.113.7',
      'x-forwarded-host': 'admin.example.test',
      'x-forwarded-proto': 'https',
    };
    const health = await app.inject({ url: '/health', remoteAddress: '203.0.113.9', headers });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    const session = await app.inject({
      url: '/me/sessions',
      remoteAddress: '203.0.113.9',
      headers,
    });
    expect(session.statusCode).toBe(401);
  });
  it('classifies every HTTP handler in the production app', () => {
    const routes = assertRouteAccess(app);
    // These samples protect against accidentally inventorying only a fixture or the root module.
    expect(routes).toEqual(
      expect.arrayContaining([
        'HealthController.check',
        'StaffAuthController.signIn',
        'StaffAuthController.enroll',
        'StaffAuthController.session',
        'SessionsController.me',
        'SessionsController.devices',
        'SessionsController.revoke',
        'SessionsController.revokeOthers',
        'TotpController.signIn',
        'TotpController.proof',
        'TotpController.setup',
        'TotpController.confirm',
        'TotpController.disable',
        'TotpRecoveryController.code',
        'TotpRecoveryController.start',
        'TotpRecoveryController.cancel',
        'TotpRecoveryController.complete',
        'AuthController.requestCode',
        'AuthController.verifyCode',
        'CustomersController.getById',
        'StoresController.create',
        'PlansController.list',
      ]),
    );
  });
});
