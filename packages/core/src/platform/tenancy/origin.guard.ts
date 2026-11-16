import { type CanActivate, type ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { loadEnv } from '../config/env';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { ACCESS_RULE, type AccessRule } from './access.decorators';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector = new Reflector()) {}
  private readonly origins = loadEnv().WEB_ORIGINS;
  // The SMS opt-out page is served from the short link origin and posts back to it.
  private readonly publicOrigins = [...this.origins, new URL(loadEnv().SHORT_LINK_BASE_URL).origin];
  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const origins = this.allowedOrigins(rule);
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; headers: { origin?: string } }>();
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !origins.includes(request.headers.origin ?? '')
    ) {
      throw new AppError('ORIGIN_REJECTED', PLATFORM_ERRORS.ORIGIN_REJECTED);
    }
    return true;
  }

  private allowedOrigins(rule: AccessRule | undefined): string[] {
    if (rule?.kind === 'staff' || rule?.kind === 'support-handoff') return [loadEnv().ADMIN_ORIGIN];
    return rule?.kind === 'public' ? this.publicOrigins : this.origins;
  }
}
