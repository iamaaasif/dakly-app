import { describe, expect, it } from 'vitest';

import type { ReadKhataRow } from '../../khata-scans/khata-row-reading';
import { scoreKhataReading, type ExpectedKhataRow } from './khata-eval';

const expected: ExpectedKhataRow[] = [
  { name: 'সুমন', amountPoisha: 100_000, entryDate: '2026-05-16' },
];
const read = (fields: Partial<ReadKhataRow>): ReadKhataRow => ({
  rowNumber: 1,
  entryDate: '2026-05-16',
  name: 'সুমন',
  phone: null,
  item: null,
  amountPoisha: 100_000,
  kind: 'baki',
  confidence: 92,
  ...fields,
});

describe('scoreKhataReading', () => {
  it('passes a right row', () => expect(scoreKhataReading([read({})], expected)).toEqual([]));

  it('fails a sure row with a wrong amount, even when the right row is also there', () => {
    expect(scoreKhataReading([read({}), read({ amountPoisha: 10_000 })], expected)).toHaveLength(1);
  });

  it('fails a sure row with a wrong date', () => {
    expect(scoreKhataReading([read({ entryDate: '2026-06-16' })], expected)).toHaveLength(1);
  });

  it('fails a month word kept as a sure name', () => {
    const rows = [read({}), read({ name: 'মাসের' })];
    expect(scoreKhataReading(rows, expected)).toHaveLength(1);
  });

  it('lets an unsure wrong row through, because the owner is asked to check it', () => {
    const rows = [read({}), read({ name: 'মাসের', amountPoisha: 60_000, confidence: 40 })];
    expect(scoreKhataReading(rows, expected)).toEqual([]);
  });

  it('accepts a flagged row with the right name and a doubtful amount as safe', () => {
    expect(scoreKhataReading([read({ amountPoisha: 820_000, confidence: 60 })], expected)).toEqual(
      [],
    );
  });

  it('fails a row that is missing', () => expect(scoreKhataReading([], expected)).toHaveLength(1));
});
