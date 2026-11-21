import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UseGuards,
} from '@nestjs/common';

import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import type { StoreRequest } from './store-request';

export const STORE_WRITABLE_CHECK = Symbol('STORE_WRITABLE_CHECK');
// Throws when the store may not send, post or automate (an unpaid plan is read-only).
export type StoreWritableCheck = { assertWritable: (storeId: string) => Promise<void> };

@Injectable()
export class WritableStoreGuard implements CanActivate {
  constructor(@Inject(STORE_WRITABLE_CHECK) private readonly check: StoreWritableCheck) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { storeId } = context.switchToHttp().getRequest<StoreRequest>();
    if (!storeId) throw new AppError('STORE_REQUIRED', PLATFORM_ERRORS.STORE_REQUIRED);
    await this.check.assertWritable(storeId);
    return true;
  }
}

// Put it on the routes that start sending, posting or automation work.
export const RequireWritableStore = () => UseGuards(WritableStoreGuard);
