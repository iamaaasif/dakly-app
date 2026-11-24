import { describe, expect, it } from 'vitest';

import { outageRetryDelay } from './reply-retry';

const now = new Date('2026-11-24T08:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('outageRetryDelay', () => {
  it('tries a fresh chat again after a model outage', () => {
    expect(outageRetryDelay('ai_unavailable', minutesAgo(1), now)).toBe(10_000);
  });

  it('hands over a chat that has waited three minutes', () => {
    expect(outageRetryDelay('ai_unavailable', minutesAgo(3), now)).toBeUndefined();
  });

  it('never delays another hand-over reason', () => {
    expect(outageRetryDelay('refund', minutesAgo(0), now)).toBeUndefined();
  });
});
