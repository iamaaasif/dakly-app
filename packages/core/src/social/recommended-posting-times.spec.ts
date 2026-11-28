import { describe, expect, it } from 'vitest';

import { recommendPostingSlots } from './recommended-posting-times';

describe('recommendPostingSlots', () => {
  it('uses the standard times when there are too few orders', () => {
    const { slots, basis } = recommendPostingSlots([{ hour: 9, orders: 5 }]);
    expect(basis).toBe('default');
    expect(slots.filter(({ weekday }) => weekday === 0).map(({ time }) => time)).toEqual([
      '12:30',
      '20:30',
    ]);
  });

  it('posts at the two busiest hours, kept apart, every day', () => {
    const { slots, basis } = recommendPostingSlots([
      { hour: 21, orders: 30 },
      { hour: 22, orders: 25 },
      { hour: 13, orders: 20 },
      { hour: 10, orders: 3 },
    ]);
    expect(basis).toBe('orders');
    expect(slots).toHaveLength(14);
    expect(slots.filter(({ weekday }) => weekday === 6).map(({ time }) => time)).toEqual([
      '13:00',
      '21:00',
    ]);
  });
});
