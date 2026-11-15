import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import type { StoreRequest } from './store-request';

export const CurrentAccess = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const { access } = context.switchToHttp().getRequest<StoreRequest>();
  if (!access) throw new AppError('STORE_REQUIRED', PLATFORM_ERRORS.STORE_REQUIRED);
  return access;
});
