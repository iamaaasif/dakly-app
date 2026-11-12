import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import type { StoreRequest } from './store-request';

@Injectable()
export class StoreGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StoreRequest>();
    if (!request.storeId) {
      throw new AppError('STORE_REQUIRED', PLATFORM_ERRORS.STORE_REQUIRED);
    }
    return true;
  }
}
