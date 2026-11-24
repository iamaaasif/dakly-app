import { describe, expect, it } from 'vitest';

import { burstText, isFlood } from './reply-burst';

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 24, 12, minutes));
const message = (index: number, body: string, minutes: number) => ({
  id: `m${index}`,
  body,
  mediaText: null,
  attachments: [],
  senderIdentityId: 'customer',
  createdAt: at(minutes),
});
const turnOf = (inbound: ReturnType<typeof message>[]) =>
  ({ latest: inbound[0], inbound }) as unknown as Parameters<typeof burstText>[0];

describe('burstText', () => {
  it('cuts one huge message and keeps its end, so the ask survives', () => {
    const turn = turnOf([message(1, `${'x '.repeat(5000)} kurti ache?`, 1)]);
    const burst = burstText(turn, 60_000, at(2));
    expect(burst.texts[0]?.length).toBeLessThanOrEqual(600);
    expect(burst.texts[0]?.endsWith('kurti ache?')).toBe(true);
    expect(burst.screenTexts[0]?.length).toBeGreaterThan(5000);
  });

  it('never adds more than the burst length, newest messages first', () => {
    const turn = turnOf(
      Array.from({ length: 15 }, (_, index) => message(index, 'y'.repeat(900), 1)),
    );
    const burst = burstText(turn, 60_000, at(2));
    expect(burst.texts.join('').length).toBeLessThanOrEqual(3000 + 600);
    expect(burst.texts.length).toBeLessThan(15);
  });
});

describe('isFlood', () => {
  it('is true for 20 customer messages inside ten minutes, and not for fewer or slower ones', () => {
    const quick = Array.from({ length: 20 }, (_, index) => message(index, 'hi', 9 - index * 0.2));
    expect(isFlood(turnOf(quick))).toBe(true);
    expect(isFlood(turnOf(quick.slice(0, 19)))).toBe(false);
    const slow = Array.from({ length: 20 }, (_, index) => message(index, 'hi', 100 - index * 5));
    expect(isFlood(turnOf(slow))).toBe(false);
  });
});
