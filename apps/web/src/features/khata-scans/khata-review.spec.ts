import { describe, expect, it } from 'vitest';

import type { KhataRowResponse } from '@dakly/contracts/khata-scans';

import {
  buildImportInput,
  confidenceTone,
  describeImported,
  needsAttention,
  rowStatus,
  untouchedChoice,
} from './khata-review';

const rowId = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function row(overrides: Partial<KhataRowResponse> & { n?: number } = {}): KhataRowResponse {
  const { n = 1, ...rest } = overrides;
  return {
    id: rowId(n),
    rowNumber: n,
    entryDate: '2026-11-02',
    name: 'Kamal',
    phone: '01819776120',
    item: 'Panjabi',
    amountPoisha: 245000,
    kind: 'sale',
    confidence: 90,
    needsCheck: false,
    match: null,
    ...rest,
  };
}

describe('needsAttention', () => {
  it('holds a yellow row until it is checked or skipped', () => {
    const yellow = row({ confidence: 64, needsCheck: true });
    expect(needsAttention(yellow, untouchedChoice)).toBe(true);
    expect(needsAttention(yellow, { ...untouchedChoice, checked: true })).toBe(false);
    expect(needsAttention(yellow, { ...untouchedChoice, skipped: true })).toBe(false);
  });

  it('holds a baki with no phone until it is linked to a customer or skipped', () => {
    const baki = row({
      kind: 'baki',
      phone: null,
      match: { contactId: rowId(9), kind: 'similar_phone' },
    });
    expect(needsAttention(baki, untouchedChoice)).toBe(true);
    expect(needsAttention(baki, { ...untouchedChoice, link: 'yes' })).toBe(false);
    const alone = row({ kind: 'baki', phone: null });
    expect(needsAttention(alone, untouchedChoice)).toBe(true);
    expect(needsAttention(alone, { ...untouchedChoice, skipped: true })).toBe(false);
  });

  it('lets a sale with no phone through as a walk-in sale', () => {
    expect(needsAttention(row({ phone: null }), untouchedChoice)).toBe(false);
  });
});

describe('buildImportInput', () => {
  it('sends one decision per row and a merge only when the owner said yes', () => {
    const similar = row({ n: 2, match: { contactId: rowId(9), kind: 'similar_phone' } });
    const declined = row({ n: 3, match: { contactId: rowId(8), kind: 'similar_phone' } });
    const skipped = row({ n: 4 });
    const input = buildImportInput([row(), similar, declined, skipped], {
      [similar.id]: { ...untouchedChoice, link: 'yes' },
      [declined.id]: { ...untouchedChoice, link: 'no' },
      [skipped.id]: { ...untouchedChoice, skipped: true },
    });
    expect(input.rows).toEqual([
      { rowId: rowId(1), action: 'import', isChecked: false },
      { rowId: rowId(2), action: 'import', isChecked: false, mergeContactId: rowId(9) },
      { rowId: rowId(3), action: 'import', isChecked: false },
      { rowId: rowId(4), action: 'skip' },
    ]);
  });
});

describe('describeImported', () => {
  it('counts matched customers and walk-in sales among the imported rows only', () => {
    const exact = row({ n: 1, match: { contactId: rowId(9), kind: 'phone' } });
    const walkIn = row({ n: 2, phone: null });
    const skippedWalkIn = row({ n: 3, phone: null });
    expect(
      describeImported([exact, walkIn, skippedWalkIn], {
        [skippedWalkIn.id]: { ...untouchedChoice, skipped: true },
      }),
    ).toEqual({ matched: 1, walkIn: 1 });
  });
});

describe('confidenceTone', () => {
  it('is green from 85, amber from 70 and red below', () => {
    expect([94, 85, 84, 70, 69].map(confidenceTone)).toEqual([
      'success',
      'success',
      'warning',
      'warning',
      'danger',
    ]);
  });
});

describe('rowStatus', () => {
  it('names what the owner still has to do with a row', () => {
    const yellow = row({ needsCheck: true, confidence: 60 });
    expect(rowStatus(yellow, untouchedChoice).label).toBe('Check this');
    expect(rowStatus(yellow, { ...untouchedChoice, checked: true }).label).toBe('Checked');
    expect(rowStatus(yellow, { ...untouchedChoice, skipped: true }).label).toBe('Skipped');
    expect(rowStatus(row(), untouchedChoice).label).toBe('Looks right');
  });
});
