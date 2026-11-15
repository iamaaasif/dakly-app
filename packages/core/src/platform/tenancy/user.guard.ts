import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { ACCESS_RULE, type AccessRule } from './access.decorators';
import type { StoreRequest } from './store-request';

@Injectable()
export class UserGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind === 'user' && !context.switchToHttp().getRequest<StoreRequest>().userId) {
      throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
    }
    return true;
  }
}
