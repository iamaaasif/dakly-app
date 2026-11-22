import {
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
} from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';

import { xlsxToCsvFile } from './xlsx-to-csv';

export const IMPORT_PREVIEW_ROWS = 20;

export type ImportFileSummary = { header: string[]; rows: string[][]; rowCount: number };

// Returns a message for the shop owner when the file cannot be imported.
function checkImportFile(file: File, excel = false): string | undefined {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !(excel && name.endsWith('.xlsx')))
    return excel
      ? 'Only Excel (.xlsx) or CSV files can be imported.'
      : 'Only CSV files can be imported. In Excel, choose Save As, then CSV UTF-8.';
  if (file.size > MAX_IMPORT_FILE_BYTES) return 'A file can be at most 10 MB.';
  if (file.size === 0) return 'This file is empty.';
  return undefined;
}

// The file to upload, always CSV, with what the browser read from it, or a message for the owner.
export async function prepareImportFile(
  file: File,
  rowName: string,
  excel: boolean,
): Promise<{ file: File; preview: ImportFileSummary } | string> {
  const problem = checkImportFile(file, excel);
  if (problem) return problem;
  let csv = file;
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    try {
      csv = await xlsxToCsvFile(file);
    } catch {
      return 'This Excel file could not be read. Check that it is a .xlsx file.';
    }
    // The converted text is what the API checks, so it has its own size limit.
    const tooLarge = checkImportFile(csv);
    if (tooLarge) return tooLarge;
  }
  const preview = readImportFile(await csv.arrayBuffer(), rowName);
  return typeof preview === 'string' ? preview : { file: csv, preview };
}

// `rowName` is what a row is in the file, such as customers, for the messages.
export function readImportFile(bytes: ArrayBuffer, rowName: string): ImportFileSummary | string {
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
    const preview: ImportFileSummary = {
      header: header.slice(0, MAX_IMPORT_COLUMNS),
      rows: [],
      rowCount: 0,
    };
    for (const cells of records) {
      if (cells.every((cell) => !cell.trim())) continue;
      preview.rowCount += 1;
      if (preview.rows.length < IMPORT_PREVIEW_ROWS) preview.rows.push(cells);
    }
    if (preview.rowCount === 0) return `This file has no ${rowName} under its column names.`;
    if (preview.rowCount > MAX_IMPORT_ROWS)
      return `A file can have at most ${formatCount(MAX_IMPORT_ROWS)} ${rowName}.`;
    return preview;
  } catch {
    return 'This file could not be read as CSV. Look for a stray quote mark.';
  }
}

// Enough of RFC 4180 for a preview: quoted cells may hold commas, line breaks and doubled quotes.
// The import job reads the file again and reports any row it cannot use.
export function* csvRecords(text: string): Generator<string[]> {
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
