import { performance } from 'node:perf_hooks';

import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { measureVendorCall } from './vendor-call-metric';

describe('measureVendorCall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['success', 'failure'] as const)(
    'logs one fixed metric line for a %s and keeps the call result',
    async (outcome) => {
      const logger = new Logger('VendorTest');
      const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
      vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(142.5);
      const failure = new Error('private vendor detail');
      const call = () =>
        outcome === 'success' ? Promise.resolve('sent') : Promise.reject(failure);
      const result = measureVendorCall(logger, 'sms_delivery', 'SMS delivery measured', call);
      if (outcome === 'success') await expect(result).resolves.toBe('sent');
      else await expect(result).rejects.toBe(failure);
      expect(log.mock.calls).toEqual([
        [
          {
            event: 'metric',
            metric: 'sms_delivery',
            count: 1,
            durationMilliseconds: 42.5,
            outcome,
          },
          'SMS delivery measured',
        ],
      ]);
    },
  );
});
