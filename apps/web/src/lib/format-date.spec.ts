import { describe, expect, it } from 'vitest';

import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatTime,
  localHour,
} from './format-date';

describe('formatDate', () => {
  it.each([
    ['2026-11-13T18:00:00Z', '2026-11-14T17:59:59Z', 'Today'],
    ['2026-11-13T17:59:59Z', '2026-11-13T18:00:00Z', 'Yesterday'],
    ['2026-11-07T04:03:00Z', '2026-11-14T04:03:00Z', '7 Nov'],
    ['2025-11-07T04:03:00Z', '2026-11-14T04:03:00Z', '7 Nov 2025'],
    ['2025-12-31T17:59:59Z', '2025-12-31T18:00:00Z', 'Yesterday'],
    ['2025-12-30T17:59:59Z', '2025-12-31T18:00:00Z', '30 Dec 2025'],
    ['2024-02-29T17:59:59Z', '2024-02-29T18:00:00Z', 'Yesterday'],
    ['2026-10-31T17:59:59Z', '2026-10-31T18:00:00Z', 'Yesterday'],
    ['2026-11-15T04:03:00Z', '2026-11-14T04:03:00Z', '15 Nov'],
  ])('formats %s relative to %s as %s in Dhaka', (value, reference, expected) => {
    expect(formatDate(value, reference)).toBe(expected);
  });

  it('uses the supplied store zone across daylight saving midnight', () => {
    expect(formatDate('2026-03-08T05:30:00Z', '2026-03-09T04:00:00Z', 'America/New_York')).toBe(
      'Yesterday',
    );
    expect(formatDate('2026-11-13T18:30:00Z', '2026-11-14T00:30:00Z', 'UTC')).toBe('Yesterday');
  });

  it('compares offset timestamps as instants rather than their written dates', () => {
    expect(formatDate('2026-11-14T00:03:00+06:00', '2026-11-13T18:04:00Z')).toBe('Today');
  });

  it.each(['invalid', '2026-11-14T10:03:00', '2026-11-14'])(
    'rejects a value without a valid explicit instant: %s',
    (value) => {
      expect(() => formatDate(value, '2026-11-14T04:03:00Z')).toThrow(RangeError);
      expect(() => formatDate('2026-11-14T04:03:00Z', value)).toThrow(RangeError);
    },
  );
});

describe('formatDateTime', () => {
  it('retains the exact date, minute and zone used for security and support deadlines', () => {
    expect(formatDateTime('2026-11-13T18:03:00Z')).toBe('14 Nov 2026, 00:03 (Asia/Dhaka)');
  });

  it('retains the exact deadline year and time across the Dhaka year boundary', () => {
    expect(formatDateTime('2026-12-31T18:03:00Z')).toBe('1 Jan 2027, 00:03 (Asia/Dhaka)');
  });
});

it('formats the full store-local date and the midnight hour', () => {
  const value = '2026-11-13T18:03:00Z';
  expect(formatCalendarDate(value, 'Asia/Dhaka')).toBe('Saturday, 14 November 2026');
  expect(localHour(value, 'Asia/Dhaka')).toBe(0);
  expect(localHour(value, 'UTC')).toBe(18);
});

describe('formatTime', () => {
  it.each([
    ['2026-11-14T04:03:00Z', '10:03 am'],
    ['2026-11-13T18:00:00Z', '12:00 am'],
    ['2026-11-14T06:00:00Z', '12:00 pm'],
    ['2026-11-14T17:59:00Z', '11:59 pm'],
  ])('formats %s as %s in Dhaka', (value, expected) => {
    expect(formatTime(value)).toBe(expected);
  });

  it('uses the store zone for time', () => {
    expect(formatTime('2026-11-14T04:03:00Z', 'UTC')).toBe('4:03 am');
  });
});

describe('date input errors', () => {
  it.each(['invalid', '2026-11-14T10:03:00', '2026-11-14'])(
    'rejects ambiguous or invalid instants for exact dates and times: %s',
    (value) => {
      expect(() => formatDateTime(value)).toThrow(RangeError);
      expect(() => formatTime(value)).toThrow(RangeError);
    },
  );

  it('rejects an invalid store time zone', () => {
    expect(() => formatDate('2026-11-14T04:03:00Z', '2026-11-14T04:03:00Z', 'invalid')).toThrow(
      RangeError,
    );
    expect(() => formatTime('2026-11-14T04:03:00Z', 'invalid')).toThrow(RangeError);
  });
});

describe.each([
  ['formatDateTime', formatDateTime],
  ['formatTime', formatTime],
  ['formatDate value', (value: string) => formatDate(value, '2026-11-14T04:03:00Z')],
  ['formatDate reference', (value: string) => formatDate('2026-11-14T04:03:00Z', value)],
] as const)('%s calendar validation', (_name, format) => {
  it.each([
    '2026-02-30T10:03:00Z',
    '2026-04-31T10:03:00Z',
    '2026-02-29T10:03:00+06:00',
    '1900-02-29T10:03:00Z',
    '2100-02-29T10:03:00-05:00',
    '2024-02-30T10:03:00Z',
  ])('rejects impossible calendar date %s instead of normalizing it', (value) => {
    expect(() => format(value)).toThrow(RangeError);
  });
});

describe('valid calendar dates', () => {
  it.each(['2000-02-29T10:03:00Z', '2024-02-29T10:03:00+06:00'])(
    'accepts leap day %s with an explicit offset',
    (value) => {
      expect(formatDate(value, value)).toBe('Today');
    },
  );

  it('keeps a valid leap day in a year below 100', () => {
    expect(formatDate('0096-02-29T10:03:00Z', '0096-03-01T10:03:00Z', 'UTC')).toBe('Yesterday');
  });

  it.each([
    ['2027-01-01T00:03:00+06:00', '1 Jan 2027, 00:03 (Asia/Dhaka)'],
    ['2026-12-31T23:03:00-05:00', '1 Jan 2027, 10:03 (Asia/Dhaka)'],
  ])('accepts the calendar date before applying the UTC offset in %s', (value, expected) => {
    expect(formatDateTime(value)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  it.each([
    ['2026-11-18T11:59:15Z', 'Just now'],
    ['2026-11-18T11:55:00Z', '5 minutes ago'],
    ['2026-11-18T09:00:00Z', '3 hours ago'],
    ['2026-11-16T12:00:00Z', '2 days ago'],
    ['2026-11-18T12:05:00Z', 'in 5 minutes'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatRelativeTime(value, now)).toBe(expected);
  });
});
