import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const KHATA_SCAN_ERRORS = {
  KHATA_PAGE_NOT_FOUND: { status: 404, message: 'Khata page not found' },
  KHATA_PAGE_NOT_UPLOADED: {
    status: 400,
    message: 'The photo was not uploaded. Upload it again',
  },
  KHATA_PAGE_ALREADY_READ: {
    status: 409,
    message: 'This page is already being read or has been read',
  },
  KHATA_SCAN_ALLOWANCE_EXCEEDED: {
    status: 402,
    message: 'You have used all the khata pages in your plan for this period',
  },
  KHATA_SCAN_RATE_LIMITED: {
    status: 429,
    message: 'A shop can upload at most 100 khata pages an hour',
  },
  KHATA_PAGE_NOT_READ: { status: 409, message: 'Only a page that was read can be imported' },
  KHATA_PAGE_ALREADY_IMPORTED: { status: 409, message: 'This page is already imported' },
  KHATA_IMPORT_ROWS_MISMATCH: {
    status: 400,
    message: 'Choose import or skip once for every row on the page',
  },
  KHATA_ROW_NEEDS_CHECK: {
    status: 422,
    message: 'Check this row before importing it. Its handwriting was hard to read',
  },
  KHATA_ROW_NEEDS_PHONE: {
    status: 422,
    message: 'A baki or payment needs a phone number to link it to a customer',
  },
  KHATA_MERGE_CONTACT_NOT_FOUND: { status: 404, message: 'Customer to merge with not found' },
  KHATA_CUSTOMER_PHONE_TAKEN: {
    status: 409,
    message: 'Another customer was added with this phone at the same time. Try again',
  },
  KHATA_IMPORT_NOT_FOUND: { status: 404, message: 'Khata import not found' },
  KHATA_IMPORT_UNDO_EXPIRED: {
    status: 409,
    message: 'A khata import can be undone only within 7 days',
  },
} as const satisfies ErrorCatalog;

export function khataScanError(code: keyof typeof KHATA_SCAN_ERRORS): AppError {
  return new AppError(code, KHATA_SCAN_ERRORS[code]);
}
