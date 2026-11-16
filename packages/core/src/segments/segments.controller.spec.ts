import { describe, expect, it } from 'vitest';

import { segmentPreviewSchema } from '@dakly/contracts/segments';

import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';

describe('SegmentsController preview body', () => {
  it('refuses 1,000 nested groups as a validation failure', () => {
    let rules: object = {
      match: 'all',
      conditions: [{ field: 'tag', operator: 'is_any_of', values: ['vip'] }],
    };
    for (let level = 1; level < 1000; level += 1) rules = { match: 'any', conditions: [rules] };

    expect(() => new ZodValidationPipe(segmentPreviewSchema).transform({ rules })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED', status: 400 }),
    );
  });

  it('refuses a field the segment builder does not offer as a validation failure', () => {
    const rules = {
      match: 'all',
      conditions: [{ field: 'orders_count', operator: 'more_than', value: 2 }],
    };

    expect(() => new ZodValidationPipe(segmentPreviewSchema).transform({ rules })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED', status: 400 }),
    );
  });
});
