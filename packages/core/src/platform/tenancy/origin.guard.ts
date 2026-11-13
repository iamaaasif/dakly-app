import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';

@Injectable()
export class OriginGuard implements CanActivate {
  private readonly origins = loadEnv().WEB_ORIGINS;
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; headers: { origin?: string } }>();
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !this.origins.includes(request.headers.origin ?? '')
    ) {
      throw new AppError('ORIGIN_REJECTED', PLATFORM_ERRORS.ORIGIN_REJECTED);
    }
    return true;
  }
}
