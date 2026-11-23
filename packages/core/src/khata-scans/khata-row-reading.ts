import {
  type KhataModelOutput,
  type KhataRowKind,
  KHATA_CONFIDENCE_THRESHOLD,
} from '@dakly/contracts/khata-scans';
import { bdMobileSchema } from '@dakly/contracts/phone';

export type ReadKhataRow = {
  rowNumber: number;
  entryDate: string | null;
  name: string;
  phone: string | null;
  item: string | null;
  amountPoisha: number;
  kind: KhataRowKind;
  confidence: number;
};

// A row the model cannot place, or whose phone or date does not parse, is capped under the
// threshold so the owner must check it (SHOP-R7). Nothing the model says lifts a row above it.
const UNSURE_CONFIDENCE = KHATA_CONFIDENCE_THRESHOLD - 1;
const MAX_ROWS_PER_PAGE = 200;
const MAX_AMOUNT_TAKA = 10_000_000;

const BANGLA_DIGITS = /[০-৯]/g;
const toEnglishDigits = (text: string) =>
  text.replace(BANGLA_DIGITS, (digit) => String(digit.charCodeAt(0) - '০'.charCodeAt(0)));

// "১,২৫০/-", "৳950", "Tk 1200", "500 taka", "1,25,000" all become poisha. Decimal taka is allowed.
export function parseAmountPoisha(text: string): number | null {
  const cleaned = toEnglishDigits(text)
    .toLowerCase()
    .replace(/৳|taka|tk\.?|টাকা|\/=|\/-/g, '')
    // Pages write "name - 500" or "500 -": a dash set apart by space is a separator, not a sign.
    .replace(/^\s*[-–—:=]+\s+/, '')
    .replace(/[,\s]/g, '')
    .replace(/[-–—:=.]+$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const taka = Number(cleaned);
  if (taka <= 0 || taka > MAX_AMOUNT_TAKA) return null;
  return Math.round(taka * 100);
}

// Day first, as shops write it: 12/11/26, ১২-১১-২০২৬, 12.11. A page often has no year, so the
// latest such day that is not in the future is used.
export function parseEntryDate(text: string, today: Date): string | null {
  return parseParts(text, today, 'day_first');
}

const MONTH_NAMES: Record<number, string[]> = {
  1: ['জানুয়ারি', 'জানুয়ারী', 'জানু', 'january', 'jan'],
  2: ['ফেব্রুয়ারি', 'ফেব্রুয়ারী', 'ফেব্রু', 'february', 'feb'],
  3: ['মার্চ', 'march', 'mar'],
  4: ['এপ্রিল', 'april', 'apr'],
  5: ['মে', 'may'],
  6: ['জুন', 'june', 'jun'],
  7: ['জুলাই', 'july', 'jul'],
  8: ['আগস্ট', 'আগষ্ট', 'august', 'aug'],
  9: ['সেপ্টেম্বর', 'সেপ্টেঃ', 'september', 'sept', 'sep'],
  10: ['অক্টোবর', 'অক্টো', 'october', 'oct'],
  11: ['নভেম্বর', 'নভে', 'november', 'nov'],
  12: ['ডিসেম্বর', 'ডিসে', 'december', 'dec'],
};
const monthByName = new Map(
  Object.entries(MONTH_NAMES).flatMap(([month, names]) =>
    names.map((name) => [name, Number(month)] as const),
  ),
);
// Words a page writes around a date that are not a person: "মাসের" (of the month) and the like.
const NOT_A_NAME = new Set([...monthByName.keys(), 'মাস', 'মাসের', 'তারিখ', 'date', 'month']);

// "16 May", "May 16", "১৬ মে ২০২৬", "16th May" become the same day as the numeric forms.
function monthNameToNumeric(text: string): string | undefined {
  const match =
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(\S+?)[,.]?(?:\s+(\d{2}|\d{4}))?$/i.exec(text) ??
    /^(\S+?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2}|\d{4}))?$/i.exec(text);
  if (!match) return undefined;
  const dayFirst = /^\d/.test(match[1] ?? '');
  const [day, word] = dayFirst ? [match[1], match[2]] : [match[2], match[1]];
  const month = monthByName.get((word ?? '').toLowerCase());
  if (!day || month === undefined) return undefined;
  return `${day}/${month}${match[3] ? `/${match[3]}` : ''}`;
}

function parseParts(text: string, today: Date, order: 'day_first' | 'month_first'): string | null {
  const digits = toEnglishDigits(text.trim());
  const named = /^\d{1,2}[/\-.]\d{1,2}/.test(digits) ? undefined : monthNameToNumeric(digits);
  // A month name is unambiguous, so it is always day then month whatever the order asked for.
  const match = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/.exec(named ?? digits);
  if (!match) return null;
  const [first, second] = [Number(match[1]), Number(match[2])];
  const isDayFirst = order === 'day_first' || named !== undefined;
  return firstRealDate(
    candidateYears(match[3], today),
    isDayFirst ? first : second,
    isDayFirst ? second : first,
    today,
  );
}

function firstRealDate(years: number[], day: number, month: number, today: Date): string | null {
  for (const year of years) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const isReal =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    if (isReal && date.getTime() <= today.getTime()) return date.toISOString().slice(0, 10);
  }
  return null;
}

function candidateYears(written: string | undefined, today: Date): number[] {
  if (written === undefined) return [today.getUTCFullYear(), today.getUTCFullYear() - 1];
  return [written.length === 2 ? 2000 + Number(written) : Number(written)];
}

export function readKhataRows(output: KhataModelOutput, today: Date): ReadKhataRow[] {
  if (!output.pageReadable) return [];
  const rows: ReadKhataRow[] = [];
  for (const row of output.rows.slice(0, MAX_ROWS_PER_PAGE)) {
    const read = readRow(row, today);
    if (read) rows.push({ ...read, rowNumber: rows.length + 1 });
  }
  return rows;
}

function readPhone(text: string | null): { phone: string | null; isBad: boolean } {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '') return { phone: null, isBad: false };
  const parsed = bdMobileSchema.safeParse(trimmed);
  return parsed.success ? { phone: parsed.data, isBad: false } : { phone: null, isBad: true };
}

function readDate(text: string | null, today: Date): { entryDate: string | null; isBad: boolean } {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '') return { entryDate: null, isBad: false };
  const dayFirst = parseEntryDate(trimmed, today);
  if (dayFirst) return { entryDate: dayFirst, isBad: false };
  // "৬/১৩/২৫" cannot be day first; some owners write month first. The owner checks the guess.
  const monthFirst = parseParts(trimmed, today, 'month_first');
  return { entryDate: monthFirst, isBad: true };
}

function readRow(
  row: KhataModelOutput['rows'][number],
  today: Date,
): Omit<ReadKhataRow, 'rowNumber'> | undefined {
  const name = row.nameText.trim().replace(/^[\s,.:;\-–—]+|[\s,.:;\-–—]+$/g, '');
  const amountPoisha = parseAmountPoisha(row.amountText);
  // No name or no amount is no row at all: there is nothing the owner could confirm.
  if (name === '' || amountPoisha === null) return undefined;
  const { phone, isBad: isPhoneBad } = readPhone(row.phoneText);
  const { entryDate, isBad: isDateBad } = readDate(row.dateText, today);
  const isUnsure =
    row.kind === 'unclear' || isPhoneBad || isDateBad || NOT_A_NAME.has(name.toLowerCase());
  return {
    entryDate,
    name,
    phone,
    item: row.itemText?.trim() || null,
    amountPoisha,
    // An unclear kind has no safe default: the owner picks it while checking the row.
    kind: row.kind === 'unclear' ? 'baki' : row.kind,
    confidence: isUnsure ? Math.min(row.confidence, UNSURE_CONFIDENCE) : row.confidence,
  };
}
