import { describe, expect, it } from 'vitest';

import { DAY_MS, HOUR_MS } from '../platform/time';
import { nextMetricsAt } from './next-metrics-at';

const publishedAt = new Date('2026-11-01T06:00:00Z');
const at = (ms: number) => new Date(publishedAt.getTime() + ms);

describe('nextMetricsAt', () => {
  it('refreshes every 6 hours during the first week', () => {
    expect(nextMetricsAt(publishedAt, at(0))).toEqual(at(6 * HOUR_MS));
    expect(nextMetricsAt(publishedAt, at(7 * DAY_MS - HOUR_MS))).toEqual(
      at(7 * DAY_MS + 5 * HOUR_MS),
    );
  });

  it('refreshes daily after the first week', () => {
    expect(nextMetricsAt(publishedAt, at(7 * DAY_MS))).toEqual(at(8 * DAY_MS));
  });

  it('stops after day 30', () => {
    expect(nextMetricsAt(publishedAt, at(29 * DAY_MS))).toEqual(at(30 * DAY_MS));
    expect(nextMetricsAt(publishedAt, at(29 * DAY_MS + HOUR_MS))).toBeNull();
  });
});
