import type { INestApplicationContext, Type } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { ACCESS_RULE, type AccessRule } from '@dakly/core/platform/tenancy/access.decorators';
import { StoreGuard } from '@dakly/core/platform/tenancy/store.guard';

type Route = { controller: Type<object>; handler: () => unknown; name: string };

export function assertRouteAccess(app: INestApplicationContext): string[] {
  const scanner = new MetadataScanner();
  const reflector = app.get(Reflector);
  const routes = [...app.get(ModulesContainer).values()].flatMap((module) =>
    [...module.controllers.values()].flatMap(({ instance, metatype }) =>
      controllerRoutes(instance, metatype as Type<object>, scanner),
    ),
  );
  const violations = routes.flatMap((route) => {
    const reason = accessViolation(route, reflector);
    return reason ? [`${route.name}: ${reason}`] : [];
  });
  if (violations.length) throw new Error(violations.join('\n'));
  if (!routes.length) throw new Error('No HTTP routes found');
  return routes.map((route) => route.name);
}

function controllerRoutes(
  instance: object,
  controller: Type<object>,
  scanner: MetadataScanner,
): Route[] {
  return scanner.getAllMethodNames(Object.getPrototypeOf(instance)).flatMap((method) => {
    const handler = (instance as Record<string, () => unknown>)[method]!;
    if (!Reflect.hasMetadata(PATH_METADATA, handler)) return [];
    return [{ controller, handler, name: `${controller.name}.${method}` }];
  });
}

function accessViolation({ controller, handler }: Route, reflector: Reflector): string | undefined {
  // Guards read the handler first; local guards compose instead of overriding the class guards.
  const rule = reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [handler, controller]);
  const guards = reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, [controller, handler]) ?? [];
  const storeRule = rule?.kind === 'permission' || rule?.kind === 'member';
  const explicitStoreGuard = guards.some(
    (guard) => guard === StoreGuard || guard instanceof StoreGuard,
  );
  if (explicitStoreGuard && !storeRule) {
    return 'store route needs RequirePermission or AnyMember';
  }
  if (!rule) return 'missing access rule';
  return staffAccessViolation(reflector.get<string>(PATH_METADATA, controller), rule);
}
function staffAccessViolation(path: string | undefined, rule: AccessRule): string | undefined {
  if (path?.startsWith('admin') && rule.kind !== 'staff') return 'admin route needs StaffAccess';
  if (rule.kind === 'staff' && !path?.startsWith('admin'))
    return 'staff routes must use admin namespace';
  return undefined;
}
