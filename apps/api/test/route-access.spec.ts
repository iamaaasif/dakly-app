import 'reflect-metadata';
import { Controller, Get, Module, UseGuards, type Type } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AnyMember,
  StaffAccess,
  Public,
  RequirePermission,
  RequireUser,
} from '@dakly/core/platform/tenancy/access.decorators';
import { StoreGuard } from '@dakly/core/platform/tenancy/store.guard';
import { assertRouteAccess } from './route-access';

@Controller('unclassified')
class UnclassifiedController {
  @Get()
  read() {}
}

@Controller('store')
@RequireUser()
@UseGuards(StoreGuard)
class StoreWithoutPermissionController {
  @Get()
  read() {}
}

@Controller('overridden-store')
@RequirePermission('customers.view')
@UseGuards(StoreGuard)
class StoreOverrideController {
  @Get()
  @UseGuards({ canActivate: () => true })
  @Public()
  read() {}
}

@Controller('method-guard')
@Public()
class MethodStoreGuardController {
  @Get()
  @UseGuards(StoreGuard)
  read() {}
}

@Controller('instance-store')
@RequireUser()
@UseGuards(new StoreGuard(new Reflector()))
class InstanceStoreGuardController {
  @Get()
  read() {}
}

@Controller('marked')
@RequireUser()
class MarkedController {
  @Get('user')
  user() {}

  @Get('public')
  @Public()
  public() {}

  @Get('permission')
  @UseGuards(StoreGuard)
  @RequirePermission('customers.view')
  permission() {}

  @Get('member')
  @UseGuards(StoreGuard)
  @AnyMember()
  member() {}

  ordinaryMethod() {}
}

@Controller('overrides')
@RequirePermission('customers.view')
class AccessOverrideController {
  @Get('public')
  @Public()
  public() {}

  @Get('user')
  @RequireUser()
  user() {}
}

class InheritedRoutes {
  @Get()
  inherited() {}
}
@Controller('inherited')
class InheritedController extends InheritedRoutes {}

@Controller('admin/unmarked')
@Public()
class PublicAdminController {
  @Get() read() {}
}
@Controller('admin/marked')
@StaffAccess(false)
class MarkedAdminController {
  @Get() read() {}
}

describe('Route access inventory', () => {
  const apps: NestFastifyApplication[] = [];

  async function fixtureApp(controller: Type<object>) {
    @Module({ controllers: [controller] })
    class FixtureModule {}
    const app = await NestFactory.create<NestFastifyApplication>(
      FixtureModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    );
    apps.push(app);
    await app.init();
    return app;
  }

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('rejects an HTTP handler with no access marker', async () => {
    const app = await fixtureApp(UnclassifiedController);
    expect(() => assertRouteAccess(app)).toThrow(
      'UnclassifiedController.read: missing access rule',
    );
  });

  it('rejects an explicit store route with only a user marker', async () => {
    const app = await fixtureApp(StoreWithoutPermissionController);
    expect(() => assertRouteAccess(app)).toThrow(
      'StoreWithoutPermissionController.read: store route needs RequirePermission or AnyMember',
    );
  });

  it('uses the method access rule before the controller rule', async () => {
    const app = await fixtureApp(StoreOverrideController);
    expect(() => assertRouteAccess(app)).toThrow(
      'StoreOverrideController.read: store route needs RequirePermission or AnyMember',
    );
  });

  it('also detects store guards declared on a method', async () => {
    const app = await fixtureApp(MethodStoreGuardController);
    expect(() => assertRouteAccess(app)).toThrow(
      'MethodStoreGuardController.read: store route needs RequirePermission or AnyMember',
    );
  });

  it('detects a StoreGuard instance as well as the guard class', async () => {
    const app = await fixtureApp(InstanceStoreGuardController);
    expect(() => assertRouteAccess(app)).toThrow(
      'InstanceStoreGuardController.read: store route needs RequirePermission or AnyMember',
    );
  });

  it('accepts user, public, permission and member routes and ignores ordinary methods', async () => {
    const app = await fixtureApp(MarkedController);
    expect(assertRouteAccess(app)).toEqual([
      'MarkedController.user',
      'MarkedController.public',
      'MarkedController.permission',
      'MarkedController.member',
    ]);
  });

  it('accepts public and user overrides without an explicit store guard', async () => {
    const app = await fixtureApp(AccessOverrideController);
    expect(assertRouteAccess(app)).toEqual([
      'AccessOverrideController.public',
      'AccessOverrideController.user',
    ]);
  });

  it('requires the staff access kind on every admin route', async () => {
    const unmarked = await fixtureApp(PublicAdminController);
    expect(() => assertRouteAccess(unmarked)).toThrow('admin route needs StaffAccess');
    const marked = await fixtureApp(MarkedAdminController);
    expect(assertRouteAccess(marked)).toEqual(['MarkedAdminController.read']);
  });

  it('includes inherited HTTP handlers', async () => {
    const app = await fixtureApp(InheritedController);
    expect(() => assertRouteAccess(app)).toThrow(
      'InheritedController.inherited: missing access rule',
    );
  });
});
