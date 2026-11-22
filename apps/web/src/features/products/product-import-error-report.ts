import type { ProductImportDryRun } from '@dakly/contracts/product-imports';

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

// Every cell is quoted, so a message with a comma stays in one column.
function errorReportCsv(errors: ProductImportDryRun['errors']): string {
  const lines = errors.map(({ rowNumber, field, message }) =>
    [String(rowNumber), field, message].map(quote).join(','),
  );
  return `${['Row,Field,Problem', ...lines].join('\r\n')}\r\n`;
}

export function downloadErrorReport(errors: ProductImportDryRun['errors']): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([errorReportCsv(errors)], { type: 'text/csv' }));
  link.download = 'dakly-product-import-errors.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}
