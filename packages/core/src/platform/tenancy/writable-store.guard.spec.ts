import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error';
import { WritableStoreGuard } from './writable-store.guard';

function context(storeId?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ storeId }) }),
  } as ExecutionContext;
}

describe('WritableStoreGuard', () => {
  it('lets a writable store through', async () => {
    const guard = new WritableStoreGuard({ assertWritable: async () => undefined });
    await expect(guard.canActivate(context('store-id'))).resolves.toBe(true);
  });

  it('passes the check error on for a read-only store', async () => {
    const error = new AppError('STORE_READ_ONLY', { status: 402, message: 'read-only' });
    const guard = new WritableStoreGuard({
      assertWritable: async () => {
        throw error;
      },
    });
    await expect(guard.canActivate(context('store-id'))).rejects.toBe(error);
  });

  it('refuses a request with no store', async () => {
    const guard = new WritableStoreGuard({ assertWritable: async () => undefined });
    await expect(guard.canActivate(context())).rejects.toMatchObject({ code: 'STORE_REQUIRED' });
  });
});
