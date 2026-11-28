import { describe, expect, it } from 'vitest';

import { ApiError } from '@dakly/ui/api-client';

import { shouldRetryQuery } from './should-retry-query';

describe('shouldRetryQuery', () => {
  it('does not retry a client error', () => {
    const error = new ApiError('DELIVERY_DEFAULT_REQUIRED', 'No zones', undefined, 409);
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('retries a server error twice', () => {
    const error = new ApiError('INTERNAL', 'Failed', undefined, 503);
    expect([0, 1, 2].map((count) => shouldRetryQuery(count, error))).toEqual([true, true, false]);
  });

  it('retries a network failure twice', () => {
    expect(
      [0, 1, 2].map((count) => shouldRetryQuery(count, new TypeError('fetch failed'))),
    ).toEqual([true, true, false]);
  });
});
