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
} as const satisfies ErrorCatalog;

export function khataScanError(code: keyof typeof KHATA_SCAN_ERRORS): AppError {
  return new AppError(code, KHATA_SCAN_ERRORS[code]);
}
