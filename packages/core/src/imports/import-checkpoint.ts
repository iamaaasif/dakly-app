import type { CustomerImportRows } from './customer-import-rows';
import type { Import, ImportCounts } from './imports.repository';

export function resumedCounts(found: Import, file: CustomerImportRows): ImportCounts {
  const failedRows = new Set(file.errors.map((error) => error.rowNumber)).size;
  return {
    rowsTotal: found.rowsTotal ?? file.rows.length + failedRows,
    rowsAdded: found.rowsAdded ?? 0,
    rowsUpdated: found.rowsUpdated ?? 0,
    rowsSkipped: found.rowsSkipped ?? 0,
    rowsFailed: found.rowsFailed ?? failedRows,
  };
}
