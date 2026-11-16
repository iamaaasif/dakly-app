import type { ValidationField } from '@dakly/contracts/errors';
import { MAX_SEGMENTS_PER_STORE } from '@dakly/contracts/segments';

import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SEGMENT_ERRORS = {
  SEGMENT_NOT_FOUND: { status: 404, message: 'Segment not found' },
  SEGMENT_NAME_TAKEN: { status: 409, message: 'A segment with this name already exists' },
  SEGMENT_LIMIT_REACHED: {
    status: 409,
    message: `A store can save at most ${MAX_SEGMENTS_PER_STORE} segments`,
  },
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
