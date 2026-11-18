import { describe, expect, it } from 'vitest';

import { orderListQuerySchema } from './orders';

describe('order list query', () => {
  it('takes a stage and an exclusive numeric cursor', () => {
    expect(orderListQuerySchema.parse({ stage: 'to_pack', cursor: '1003', limit: '10' })).toEqual({
      stage: 'to_pack',
      cursor: 1003,
      limit: 10,
    });
  });

  it.each([{ stage: 'inquiry' }, { cursor: '-1' }, { limit: '101' }, { storeId: 'other' }])(
    'rejects an unsupported filter %j',
    (query) => {
      expect(orderListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});
