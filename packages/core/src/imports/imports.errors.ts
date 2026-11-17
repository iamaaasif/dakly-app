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
  IMPORT_FILE_NOT_UPLOADED: { status: 400, message: 'The file was not uploaded. Upload it again' },
  IMPORT_FILE_TOO_LARGE: { status: 400, message: 'A file can be at most 10 MB' },
  IMPORT_NOT_FOUND: { status: 404, message: 'Import not found' },
  IMPORT_ALREADY_STARTED: { status: 409, message: 'This import has already started' },
  IMPORT_NOT_UNDOABLE: {
    status: 409,
    message: 'Only an import that has finished can be undone, and only once',
  },
  IMPORT_UNDO_EXPIRED: {
    status: 409,
    message: 'An import can be undone for 7 days after it finishes',
  },
} as const satisfies ErrorCatalog;

export function importError(code: keyof typeof IMPORT_ERRORS): AppError {
  return new AppError(code, IMPORT_ERRORS[code]);
}
