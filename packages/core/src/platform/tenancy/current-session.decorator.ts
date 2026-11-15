import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import type { StoreRequest } from './store-request';

export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const { sessionId } = context.switchToHttp().getRequest<StoreRequest>();
  if (!sessionId) throw new AppError('AUTH_REQUIRED', PLATFORM_ERRORS.AUTH_REQUIRED);
  return sessionId;
});
