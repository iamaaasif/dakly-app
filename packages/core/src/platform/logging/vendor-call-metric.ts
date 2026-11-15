import { performance } from 'node:perf_hooks';

import type { Logger } from '@nestjs/common';

// Fixed metric fields keep recipient data and provider errors out of aggregation.
export async function measureVendorCall<Result>(
  logger: Logger,
  metric: string,
  message: string,
  call: () => Promise<Result>,
): Promise<Result> {
  const startedAt = performance.now();
  let outcome: 'success' | 'failure' = 'failure';
  try {
    const result = await call();
    outcome = 'success';
    return result;
  } finally {
    logger.log(
      {
        event: 'metric',
        metric,
        count: 1,
        durationMilliseconds: performance.now() - startedAt,
        outcome,
      },
      message,
    );
  }
}
