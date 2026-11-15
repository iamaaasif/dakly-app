import 'reflect-metadata';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';

import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import {
  AnyMember,
  Public,
  RequirePermission,
  RequireUser,
} from '../platform/tenancy/access.decorators';
import { PermissionGuard } from '../platform/tenancy/permission.guard';
import type { StoreRequest } from '../platform/tenancy/store-request';
import { StoreGuard } from '../platform/tenancy/store.guard';
import { builtInRoleAccess } from './built-in-roles';
import { TeamModule } from './team.module';

class PermissionController {
  edit() {
    return 'edited';
  }

  view() {
    return 'viewed';
  }

  billing() {
    return 'billed';
  }

  member() {
    return 'member';
  }

  user() {
    return 'user';
  }

  public() {
    return 'public';
  }
}
Controller('permissions')(PermissionController);
UseGuards(PermissionGuard)(PermissionController);
RequirePermission('orders.edit')(PermissionController);
for (const [method, access] of [
  ['edit', undefined],
  ['view', RequirePermission('customers.view')],
  ['billing', RequirePermission('billing.edit')],
  ['member', AnyMember()],
  ['user', RequireUser()],
  ['public', Public()],
] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(PermissionController.prototype, method)!;
  Get(method)(PermissionController.prototype, method, descriptor);
  access?.(PermissionController.prototype, method, descriptor);
}

class UnclassifiedController {
  get() {
    return 'unclassified';
  }
}
Controller('unclassified')(UnclassifiedController);
UseGuards(PermissionGuard)(UnclassifiedController);
Get()(
  UnclassifiedController.prototype,
  'get',
  Object.getOwnPropertyDescriptor(UnclassifiedController.prototype, 'get')!,
);

class StoreController {
  get() {
    return 'store';
  }
}
Controller('store')(StoreController);
UseGuards(StoreGuard, PermissionGuard)(StoreController);
const storeDescriptor = Object.getOwnPropertyDescriptor(StoreController.prototype, 'get')!;
Get()(StoreController.prototype, 'get', storeDescriptor);
AnyMember()(StoreController.prototype, 'get', storeDescriptor);

class PermissionTestModule {}
Module({
  imports: [DatabaseModule, TeamModule],
  controllers: [PermissionController, UnclassifiedController, StoreController],
})(PermissionTestModule);

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const userId = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';
const member = (access: StoreAccess): StoreRequest => ({ storeId, userId, access });

describe('TeamModule permission guard over Fastify', () => {
  let app: NestFastifyApplication;
  let trustedRequest: StoreRequest = {};

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgres://localhost/dakly';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    app = await NestFactory.create<NestFastifyApplication>(
      PermissionTestModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    );
    // Simulate the trusted session boundary, never data from the incoming request.
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (request: StoreRequest) => {
        Object.assign(request, trustedRequest);
      });
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    trustedRequest = {};
  });

  it('allows public access and overrides the controller permission', async () => {
    expect((await app.inject('/permissions/public')).statusCode).toBe(200);
  });

  it('allows a signed-in user with no store only on user routes', async () => {
    trustedRequest = { userId };
    expect((await app.inject('/permissions/user')).statusCode).toBe(200);
    expect((await app.inject('/permissions/member')).statusCode).toBe(403);
  });

  it.each(['user', 'member', 'view', 'edit'])(
    'denies %s without trusted session data',
    async (route) => {
      const response = await app.inject({
        url: `/permissions/${route}?userId=${userId}&storeId=${storeId}`,
        headers: { 'x-store-id': storeId, 'x-user-id': userId, 'x-role': 'owner' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'PERMISSION_DENIED' } });
    },
  );

  it('allows any known member without requiring area access', async () => {
    trustedRequest = member({ ...builtInRoleAccess.marketer, role: 'custom', areas: {} });
    expect((await app.inject('/permissions/member')).statusCode).toBe(200);
    expect((await app.inject('/permissions/edit')).statusCode).toBe(403);
  });

  it('checks the current request access without retaining earlier grants', async () => {
    trustedRequest = member(builtInRoleAccess.support_agent);
    expect((await app.inject('/permissions/edit')).statusCode).toBe(200);
    trustedRequest = member(builtInRoleAccess.marketer);
    expect((await app.inject('/permissions/edit')).statusCode).toBe(403);
    trustedRequest = {};
    expect((await app.inject('/permissions/edit')).statusCode).toBe(403);
  });

  it('lets edit imply view while respecting a method permission override', async () => {
    trustedRequest = member(builtInRoleAccess.marketer);
    expect((await app.inject('/permissions/view')).statusCode).toBe(200);
    expect((await app.inject('/permissions/edit')).statusCode).toBe(403);
  });

  it.each(['admin', 'custom'] as const)(
    'denies %s forged billing changes through the policy',
    async (role) => {
      trustedRequest = member({ ...builtInRoleAccess.admin, role, areas: { billing: 'edit' } });
      expect((await app.inject('/permissions/billing')).statusCode).toBe(403);
      trustedRequest = member(builtInRoleAccess.owner);
      expect((await app.inject('/permissions/billing')).statusCode).toBe(200);
    },
  );

  it.each([
    { storeId, userId },
    { storeId, access: builtInRoleAccess.owner },
    { userId, access: builtInRoleAccess.owner },
    member({ ...builtInRoleAccess.owner, role: 'unknown' } as StoreAccess),
  ])('rejects incomplete or unknown membership %j', async (request) => {
    trustedRequest = request;
    expect((await app.inject('/permissions/member')).statusCode).toBe(403);
    expect((await app.inject('/permissions/edit')).statusCode).toBe(403);
  });

  it('denies a route without an access classification even for Owner', async () => {
    trustedRequest = member(builtInRoleAccess.owner);
    expect((await app.inject('/unclassified')).statusCode).toBe(403);
  });

  it('preserves StoreGuard rejection before permission evaluation', async () => {
    const response = await app.inject('/store');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'STORE_REQUIRED' } });
    trustedRequest = member(builtInRoleAccess.support_agent);
    expect((await app.inject('/store')).statusCode).toBe(200);
  });
});
