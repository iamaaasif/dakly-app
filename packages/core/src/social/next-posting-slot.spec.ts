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

  it('compares available slots by UTC time when local times repeat', () => {
    const picked = nextPostingSlot(
      [
        { weekday: 0, time: '01:10' },
        { weekday: 0, time: '01:30' },
      ],
      new Date('2026-11-01T05:05:00.000Z'),
      'America/New_York',
      new Set(),
    );
    expect(picked?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('keeps a reserved local slot occupied when the clock repeats its time', () => {
    const slots = [{ weekday: 0, time: '01:30' }];
    const now = new Date('2026-11-01T06:04:00.000Z');
    const earlier = Date.parse('2026-11-01T05:30:00Z');
    const timeZone = 'America/New_York';
    expect(nextPostingSlot(slots, now, timeZone, new Set())?.toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    );
    expect(nextPostingSlot(slots, now, timeZone, new Set([earlier]))?.toISOString()).toBe(
      '2026-11-08T06:30:00.000Z',
    );
  });
});
