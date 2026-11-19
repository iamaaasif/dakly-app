import { type CanActivate, type ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { loadEnv } from '../config/env';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import {
  ACCESS_RULE,
  type AccessRule,
  PROVIDER_CALLBACK,
  SHORT_LINK_ORIGIN,
} from './access.decorators';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector = new Reflector()) {}
  private readonly origins = loadEnv().WEB_ORIGINS;
  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      rule?.kind === 'public' &&
      this.reflector.get<boolean>(PROVIDER_CALLBACK, context.getHandler())
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; headers: { origin?: string } }>();
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !this.allowedOrigins(rule, context).includes(request.headers.origin ?? '')
    ) {
      throw new AppError('ORIGIN_REJECTED', PLATFORM_ERRORS.ORIGIN_REJECTED);
    }
    return true;
  }

  private allowedOrigins(rule: AccessRule | undefined, context: ExecutionContext): string[] {
    const origins =
      rule?.kind === 'staff' || rule?.kind === 'support-handoff'
        ? [loadEnv().ADMIN_ORIGIN]
        : [...this.origins];
    if (this.reflector.get<boolean>(SHORT_LINK_ORIGIN, context.getHandler()))
      origins.push(new URL(loadEnv().SHORT_LINK_BASE_URL).origin);
    return origins;
  }
}
