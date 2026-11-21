import { describe, expect, it } from 'vitest';

import { KHATA_CONFIDENCE_THRESHOLD, type KhataModelOutput } from '@dakly/contracts/khata-scans';

import { parseAmountPoisha, parseEntryDate, readKhataRows } from './khata-row-reading';

const today = new Date('2026-11-21T04:00:00Z');
type ModelRow = KhataModelOutput['rows'][number];
const row = (fields: Partial<ModelRow>): ModelRow => ({
  dateText: null,
  nameText: 'Rahim Uddin',
  phoneText: null,
  itemText: null,
  amountText: '500',
  kind: 'baki',
  confidence: 95,
  ...fields,
});

// Samples shaped like what the model copies from real pages: Bangla script, Banglish and a mix,
// with Bangla and English digits. The gate below needs every one to come out right.
const evalSet: {
  label: string;
  input: ModelRow;
  expected: {
    amountPoisha: number;
    phone: string | null;
    entryDate: string | null;
    needsCheck: boolean;
  };
}[] = [
  {
    label: 'Bangla name, Bangla digits and slash-dash amount',
    input: row({
      nameText: 'রহিম উদ্দিন',
      phoneText: '০১৭১২-৩৪৫৬৭৮',
      amountText: '১,২৫০/-',
      dateText: '১২/১১/২৬',
    }),
    expected: {
      amountPoisha: 125_000,
      phone: '01712345678',
      entryDate: '2026-11-12',
      needsCheck: false,
    },
  },
  {
    label: 'Banglish line with English digits and tk',
    input: row({
      nameText: 'Mitu Akter',
      phoneText: '01556 781230',
      amountText: 'Tk 950',
      dateText: '3/11/2026',
    }),
    expected: {
      amountPoisha: 95_000,
      phone: '01556781230',
      entryDate: '2026-11-03',
      needsCheck: false,
    },
  },
  {
    label: 'mixed script with mixed digits and taka word',
    input: row({
      nameText: 'শিলা Rani',
      phoneText: '০1712345678',
      amountText: '৫00 টাকা',
      dateText: '১২-১১',
    }),
    expected: {
      amountPoisha: 50_000,
      phone: '01712345678',
      entryDate: '2026-11-12',
      needsCheck: false,
    },
  },
  {
    label: 'phone with country code',
    input: row({ phoneText: '+8801812345678', amountText: '৳১২০০' }),
    expected: { amountPoisha: 120_000, phone: '01812345678', entryDate: null, needsCheck: false },
  },
  {
    label: 'phone missing its leading zero',
    input: row({ phoneText: '1912345678', amountText: '75' }),
    expected: { amountPoisha: 7_500, phone: '01912345678', entryDate: null, needsCheck: false },
  },
  {
    label: 'lakh grouping',
    input: row({ amountText: '1,25,000/-' }),
    expected: { amountPoisha: 12_500_000, phone: null, entryDate: null, needsCheck: false },
  },
  {
    label: 'decimal taka',
    input: row({ amountText: '৳৩৫০.৫০' }),
    expected: { amountPoisha: 35_050, phone: null, entryDate: null, needsCheck: false },
  },
  {
    label: 'short phone is dropped and the row needs a check',
    input: row({ phoneText: '০১৭১২৩৪', amountText: '২০০' }),
    expected: { amountPoisha: 20_000, phone: null, entryDate: null, needsCheck: true },
  },
  {
    label: 'impossible date is dropped and the row needs a check',
    input: row({ dateText: '31/02/26', amountText: '90' }),
    expected: { amountPoisha: 9_000, phone: null, entryDate: null, needsCheck: true },
  },
  {
    label: 'model unsure about the row',
    input: row({ confidence: 60, amountText: '১০০' }),
    expected: { amountPoisha: 10_000, phone: null, entryDate: null, needsCheck: true },
  },
  {
    label: 'unclear kind needs a check even at high confidence',
    input: row({ kind: 'unclear', confidence: 99, amountText: '300' }),
    expected: { amountPoisha: 30_000, phone: null, entryDate: null, needsCheck: true },
  },
];

describe('reading khata rows', () => {
  it('reads every Bangla, Banglish and mixed sample correctly', () => {
    const wrong = evalSet.filter(({ input, expected }) => {
      const [read] = readKhataRows({ pageReadable: true, rows: [input] }, today);
      return (
        !read ||
        read.amountPoisha !== expected.amountPoisha ||
        read.phone !== expected.phone ||
        read.entryDate !== expected.entryDate ||
        read.confidence < KHATA_CONFIDENCE_THRESHOLD !== expected.needsCheck ||
        read.name !== input.nameText
      );
    });
    expect(wrong.map(({ label }) => label)).toEqual([]);
  });

  it('keeps names in the script they were written in', () => {
    const rows = readKhataRows(
      {
        pageReadable: true,
        rows: [
          row({ nameText: ' রহিম ' }),
          row({ nameText: 'Mitu Akter' }),
          row({ nameText: 'শিলা Rani' }),
        ],
      },
      today,
    );
    expect(rows.map((read) => read.name)).toEqual(['রহিম', 'Mitu Akter', 'শিলা Rani']);
  });

  it('drops rows with no name or no readable amount and renumbers the rest', () => {
    const rows = readKhataRows(
      {
        pageReadable: true,
        rows: [
          row({ nameText: '' }),
          row({ amountText: 'পাঁচশো' }),
          row({ nameText: 'Karim', amountText: '০' }),
          row({ nameText: 'Jahan', amountText: '৪০০' }),
        ],
      },
      today,
    );
    expect(rows.map(({ rowNumber, name }) => [rowNumber, name])).toEqual([[1, 'Jahan']]);
  });

  it('returns no rows for a page the model could not read', () => {
    expect(readKhataRows({ pageReadable: false, rows: [row({})] }, today)).toEqual([]);
  });
});

describe('parseAmountPoisha', () => {
  it.each([
    ['১২৫০', 125_000],
    ['1250/-', 125_000],
    ['Tk. 99', 9_900],
    ['৳ ৫,০০০', 500_000],
  ])('reads %s', (text, poisha) => expect(parseAmountPoisha(text)).toBe(poisha));

  it.each(['', 'abc', '-50', '0', '1.2.3'])('rejects %s', (text) =>
    expect(parseAmountPoisha(text)).toBeNull(),
  );
});

describe('parseEntryDate', () => {
  it('uses last year when a day without a year is still ahead', () => {
    expect(parseEntryDate('২৫/১২', today)).toBe('2025-12-25');
  });

  it('refuses a date in the future', () => {
    expect(parseEntryDate('25/12/2026', today)).toBeNull();
  });
});
