import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import type { StoreRequest } from './store-request';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const { userId } = context.switchToHttp().getRequest<StoreRequest>();
  if (!userId) throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
  return userId;
});
