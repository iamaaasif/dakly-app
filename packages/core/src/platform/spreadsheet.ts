import { csvCell } from './csv-cell';

export const MAX_EXPORT_ROWS = 50_000;
export const CSV_TYPE = 'text/csv; charset=utf-8';
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Rows = ReadonlyArray<ReadonlyArray<string | number>>;

export function spreadsheetCsv(rows: Rows): string {
  // The byte order mark lets Excel read Bangla text as UTF-8.
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export async function spreadsheetXlsx(rows: Rows): Promise<Buffer> {
  const sheet = rows.map((row, index) =>
    row.map((value) => (index === 0 ? { value, fontWeight: 'bold' as const } : { value })),
  );
  // String cells preserve the raw text without creating spreadsheet formulas.
  const { default: writeXlsxFile } = await import('write-excel-file/node');
  return writeXlsxFile(sheet).toBuffer();
}
