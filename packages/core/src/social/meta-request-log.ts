import type { Logger } from '@nestjs/common';

import { MetaPublishingError } from '@dakly/providers/social/meta-publishing-driver';

import { measureVendorCall } from '../platform/logging/vendor-call-metric';

// Meta's own code and message go to the log only, so a rejected post can be explained later.
export async function measureMetaCall<Result>(
  logger: Logger,
  operation: string,
  call: () => Promise<Result>,
): Promise<Result> {
  try {
    return await measureVendorCall(logger, operation, 'Meta publishing request measured', call);
  } catch (failure) {
    if (failure instanceof MetaPublishingError && failure.detail)
      logger.warn({ operation, metaError: failure.detail }, 'Meta rejected the request');
    throw failure;
  }
}
