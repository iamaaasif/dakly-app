import { describe, expect, it } from 'vitest';

import { nextPostingSlot } from './next-posting-slot';

describe('nextPostingSlot', () => {
  const fridaySlots = [
    { weekday: 5, time: '20:45' },
    { weekday: 5, time: '20:15' },
    { weekday: 5, time: '20:30' },
  ];

  it('uses Dhaka time and accepts a slot at the fifteen-minute boundary', () => {
    const picked = nextPostingSlot(
      fridaySlots,
      new Date('2026-11-20T14:15:00.000Z'),
      'Asia/Dhaka',
      new Set(),
    );
    expect(picked?.toISOString()).toBe('2026-11-20T14:30:00.000Z');
  });

  it('moves to the next week when the remaining slots are reserved', () => {
    const picked = nextPostingSlot(
      fridaySlots,
      new Date('2026-11-20T14:15:00.000Z'),
      'Asia/Dhaka',
      new Set([Date.parse('2026-11-20T14:30:00Z'), Date.parse('2026-11-20T14:45:00Z')]),
    );
    expect(picked?.toISOString()).toBe('2026-11-27T14:15:00.000Z');
  });
});
