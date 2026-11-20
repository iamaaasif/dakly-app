import type { ImportReportLine as ReportLine } from './imports.repository';

// Every cell is quoted, so a message with a comma stays in one column.
export function reportCsv(
  lines: ReportLine[],
  omittedRows: number,
  labels: Record<string, string>,
): string {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const sorted = [...lines].sort((a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0));
  const records = sorted.map((line) =>
    [
      String(line.rowNumber ?? ''),
      line.field ? (labels[line.field] ?? line.field) : '',
      line.message,
    ]
      .map(cell)
      .join(','),
  );
  if (omittedRows > 0)
    records.push(
      ['', '', `${omittedRows} more rows had notes that are not listed`].map(cell).join(','),
    );
  return `${['Row,Field,Problem', ...records].join('\r\n')}\r\n`;
}
