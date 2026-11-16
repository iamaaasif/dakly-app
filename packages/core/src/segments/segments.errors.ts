import type { ValidationField } from '@dakly/contracts/errors';

import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SEGMENT_ERRORS = {
  SEGMENT_FIELD_NOT_AVAILABLE: {
    status: 400,
    message: 'This segment uses a field that is not available yet',
  },
} as const satisfies ErrorCatalog;

export function segmentError(
  code: keyof typeof SEGMENT_ERRORS,
  fields?: ValidationField[],
): AppError {
  return new AppError(code, SEGMENT_ERRORS[code], fields);
}
