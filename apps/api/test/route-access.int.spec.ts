import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { registerSessionCookies } from '@dakly/core/platform/http/session-cookie';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { assertRouteAccess } from './route-access';

describe('API route access rules', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('classifies every HTTP handler in the production app', () => {
    const routes = assertRouteAccess(app);
    // These samples protect against accidentally inventorying only a fixture or the root module.
    expect(routes).toEqual(
      expect.arrayContaining([
        'HealthController.check',
        'SessionsController.me',
        'AuthController.requestCode',
        'AuthController.verifyCode',
        'CustomersController.getById',
        'StoresController.create',
        'PlansController.list',
      ]),
    );
  });
});
