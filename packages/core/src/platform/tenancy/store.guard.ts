import { Reflector } from '@nestjs/core';
import { ACCESS_RULE, type AccessRule } from './access.decorators';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import type { StoreRequest } from './store-request';

@Injectable()
export class StoreGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind === 'public' || rule?.kind === 'user') return true;
    const request = context.switchToHttp().getRequest<StoreRequest>();
    if (!request.storeId) {
      throw new AppError('STORE_REQUIRED', PLATFORM_ERRORS.STORE_REQUIRED);
    }
    return true;
  }
}
