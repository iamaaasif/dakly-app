import {
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
} from '@dakly/contracts/contacts';

import { formatCount } from '@/lib/format-money';

export type ImportFileSummary = { header: string[]; rowCount: number };

// Returns a message for the shop owner when the file cannot be imported.
export function checkImportFile(file: File): string | undefined {
  if (!file.name.toLowerCase().endsWith('.csv'))
    return 'Only CSV files can be imported. In Excel, choose Save As, then CSV UTF-8.';
  if (file.size > MAX_IMPORT_FILE_BYTES) return 'A file can be at most 10 MB.';
  if (file.size === 0) return 'This file is empty.';
  return undefined;
}

export function readImportFile(bytes: ArrayBuffer): ImportFileSummary | string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'Save the file as CSV UTF-8 and choose it again.';
  }
  try {
    const records = csvRecords(text.startsWith('\uFEFF') ? text.slice(1) : text);
    const header = records.next().value;
    if (!header) return 'This file has no column names in its first row.';
    const summary: ImportFileSummary = {
      header: header.slice(0, MAX_IMPORT_COLUMNS),
      rowCount: 0,
    };
    for (const cells of records) if (cells.some((cell) => cell.trim())) summary.rowCount += 1;
    if (summary.rowCount === 0) return 'This file has no customers under its column names.';
    if (summary.rowCount > MAX_IMPORT_ROWS)
      return `A file can have at most ${formatCount(MAX_IMPORT_ROWS)} customers.`;
    return summary;
  } catch {
    return 'This file could not be read as CSV. Look for a stray quote mark.';
  }
}

// Enough of RFC 4180 to count rows: quoted cells may hold commas, line breaks and doubled quotes.
// The import job reads the file again and reports any row it cannot use.
function* csvRecords(text: string): Generator<string[]> {
  const token = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n|\n|\r|$)/y;
  let cells: string[] = [];
  while (token.lastIndex < text.length) {
    const match = token.exec(text);
    if (!match) throw new Error('Unreadable CSV');
    const [, cell = '', separator] = match;
    cells.push(cell.startsWith('"') ? cell.slice(1, -1).replaceAll('""', '"') : cell);
    if (separator === ',') continue;
    yield cells;
    cells = [];
  }
  if (cells.length) yield [...cells, ''];
}
