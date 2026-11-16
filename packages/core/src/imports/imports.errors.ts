import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

// Feature 03: a customer file holds at most 50,000 rows.
export const MAX_IMPORT_ROWS = 50_000;

const IMPORT_ERRORS = {
  IMPORT_FILE_UNREADABLE: {
    status: 400,
    message: 'This file is not a readable CSV. Save it as CSV (UTF-8) and upload it again',
  },
  IMPORT_FILE_EMPTY: { status: 400, message: 'This file has no customer rows under its header' },
  IMPORT_FILE_TOO_MANY_ROWS: {
    status: 400,
    message: 'A file can hold at most 50,000 customers',
  },
  IMPORT_COLUMN_MISSING: { status: 400, message: 'A mapped column is not in this file' },
} as const satisfies ErrorCatalog;

export function importError(code: keyof typeof IMPORT_ERRORS): AppError {
  return new AppError(code, IMPORT_ERRORS[code]);
}
