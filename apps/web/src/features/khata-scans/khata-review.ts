import {
  KHATA_CONFIDENCE_THRESHOLD,
  type ImportKhataPageInput,
  type KhataRowEdit,
  type KhataRowResponse,
} from '@dakly/contracts/khata-scans';
import { bdMobileSchema } from '@dakly/contracts/phone';

// What the owner typed into a cell, as text. A key is present only once the owner changed it.
export type RowDraft = {
  entryDate?: string;
  name?: string;
  phone?: string;
  item?: string;
  amount?: string;
};

export type RowChoice = {
  skipped: boolean;
  checked: boolean;
  link: 'undecided' | 'yes' | 'no';
  draft: RowDraft;
};

export const untouchedChoice: RowChoice = {
  skipped: false,
  checked: false,
  link: 'undecided',
  draft: {},
};

export type RowFieldName = 'entryDate' | 'name' | 'phone' | 'item' | 'amount';
export type RowErrors = Partial<Record<RowFieldName, string>>;

const MAX_AMOUNT_TAKA = 10_000_000;

export function takaText(amountPoisha: number): string {
  const taka = amountPoisha / 100;
  return Number.isInteger(taka) ? String(taka) : taka.toFixed(2);
}

function parseTakaText(text: string): number | null {
  const cleaned = text
    .replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - '০'.charCodeAt(0)))
    .replace(/[,\s৳]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const taka = Number(cleaned);
  return taka > 0 && taka <= MAX_AMOUNT_TAKA ? Math.round(taka * 100) : null;
}

export type RowReading = {
  entryDate: string | null;
  name: string;
  phone: string | null;
  item: string | null;
  amountPoisha: number;
  errors: RowErrors;
  // Only the corrections that are valid; what has an error is left out and blocks the import.
  edit: KhataRowEdit | undefined;
};

type Reader = (row: KhataRowResponse, text: string) => Partial<RowReading> & { error?: string };

const fieldReaders: Record<RowFieldName, Reader> = {
  entryDate: (_row, text) => ({ entryDate: text === '' ? null : text }),
  name: (_row, text) => (text.trim() === '' ? { error: 'Enter a name' } : { name: text.trim() }),
  phone: (_row, text) => {
    if (text.trim() === '') return { phone: null };
    const parsed = bdMobileSchema.safeParse(text);
    return parsed.success ? { phone: parsed.data } : { error: 'Use 01XXXXXXXXX' };
  },
  item: (_row, text) => ({ item: text.trim() || null }),
  amount: (_row, text) => {
    const poisha = parseTakaText(text);
    return poisha === null ? { error: 'Enter an amount in taka' } : { amountPoisha: poisha };
  },
};

const editKeys = {
  entryDate: 'entryDate',
  name: 'name',
  phone: 'phone',
  item: 'item',
  amount: 'amountPoisha',
} as const;

// The row as the owner sees it: what was read, with their corrections laid over it.
export function readRow(row: KhataRowResponse, choice: RowChoice): RowReading {
  const reading: RowReading = { ...row, errors: {}, edit: undefined };
  const edit: Record<string, string | number | null> = {};
  for (const field of Object.keys(fieldReaders) as RowFieldName[]) {
    const text = choice.draft[field];
    if (text === undefined) continue;
    const { error, ...value } = fieldReaders[field](row, text);
    if (error) reading.errors[field] = error;
    else {
      Object.assign(reading, value);
      edit[editKeys[field]] = value[editKeys[field]] ?? null;
    }
  }
  if (Object.keys(edit).length > 0) reading.edit = edit;
  return reading;
}

// A suggestion is about the phone that was read, so it is dropped once the owner changes the phone.
function linkedContactId(row: KhataRowResponse, choice: RowChoice): string | undefined {
  return row.match?.kind === 'similar_phone' &&
    choice.link === 'yes' &&
    choice.draft.phone === undefined
    ? row.match.contactId
    : undefined;
}

// Baki and payments need a customer, so a row with no phone stays blocked until it is linked or skipped.
function needsPhone(row: KhataRowResponse, choice: RowChoice): boolean {
  return (
    row.kind !== 'sale' && !readRow(row, choice).phone && linkedContactId(row, choice) === undefined
  );
}

export function needsAttention(row: KhataRowResponse, choice: RowChoice): boolean {
  if (choice.skipped) return false;
  const hasError = Object.keys(readRow(row, choice).errors).length > 0;
  return hasError || (row.needsCheck && !choice.checked) || needsPhone(row, choice);
}

export function buildImportInput(
  rows: KhataRowResponse[],
  choices: Record<string, RowChoice>,
): ImportKhataPageInput {
  return {
    rows: rows.map((row) => {
      const choice = choices[row.id] ?? untouchedChoice;
      if (choice.skipped) return { rowId: row.id, action: 'skip' as const };
      const mergeContactId = linkedContactId(row, choice);
      const { edit } = readRow(row, choice);
      return {
        rowId: row.id,
        action: 'import' as const,
        isChecked: choice.checked,
        ...(mergeContactId ? { mergeContactId } : {}),
        ...(edit ? { edit } : {}),
      };
    }),
  };
}

// Counts for the result screen that the import response does not carry.
export function describeImported(rows: KhataRowResponse[], choices: Record<string, RowChoice>) {
  const imported = rows.filter((row) => !(choices[row.id] ?? untouchedChoice).skipped);
  return {
    matched: imported.filter(
      (row) =>
        row.match?.kind === 'phone' ||
        linkedContactId(row, choices[row.id] ?? untouchedChoice) !== undefined,
    ).length,
    walkIn: imported.filter(
      (row) => row.kind === 'sale' && !readRow(row, choices[row.id] ?? untouchedChoice).phone,
    ).length,
  };
}

export function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' {
  if (confidence >= KHATA_CONFIDENCE_THRESHOLD) return 'success';
  return confidence >= 70 ? 'warning' : 'danger';
}

export type RowStatus = { label: string; tone: 'success' | 'warning' | 'muted' };

export function rowStatus(row: KhataRowResponse, choice: RowChoice): RowStatus {
  if (choice.skipped) return { label: 'Skipped', tone: 'muted' };
  if (Object.keys(readRow(row, choice).errors).length > 0)
    return { label: 'Fix this', tone: 'warning' };
  if (choice.checked) return { label: 'Checked', tone: 'success' };
  return needsAttention(row, choice)
    ? { label: 'Check this', tone: 'warning' }
    : { label: 'Looks right', tone: 'success' };
}
