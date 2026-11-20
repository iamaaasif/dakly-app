import { describe, expect, it } from 'vitest';

import { monthToDate } from './report-period';

describe('monthToDate', () => {
  it('compares with the same days of the month before', () => {
    expect(monthToDate('2026-11-08')).toEqual({
      current: { from: '2026-11-01', through: '2026-11-08' },
      previous: { from: '2026-10-01', through: '2026-10-08' },
    });
  });

  it('ends a shorter earlier month on its last day', () => {
    expect(monthToDate('2026-03-31').previous).toEqual({
      from: '2026-02-01',
      through: '2026-02-28',
    });
  });

  it('crosses a year start', () => {
    expect(monthToDate('2027-01-02').previous).toEqual({
      from: '2026-12-01',
      through: '2026-12-02',
    });
  });
});
