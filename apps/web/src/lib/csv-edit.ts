import { csvRecords } from './import-file';

export type CellEdit = { rowNumber: number; column: number; value: string };

const quote = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

// Row numbers are the spreadsheet's: the header is row 1. Everything else in the file is kept as
// it was, so a corrected file differs only in the cells the owner changed.
export function applyCellEdits(csv: string, edits: CellEdit[]): string {
  const records = [...csvRecords(csv.startsWith('﻿') ? csv.slice(1) : csv)];
  for (const { rowNumber, column, value } of edits) {
    const record = records[rowNumber - 1];
    if (!record) continue;
    while (record.length <= column) record.push('');
    record[column] = value;
  }
  return records.map((record) => record.map(quote).join(',')).join('\r\n');
}
