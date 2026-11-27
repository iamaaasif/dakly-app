import { MAX_HAND_PICKED_CONTACTS, MAX_SEGMENTS_PER_STORE } from '@dakly/contracts/segments';

import { AppError, type ErrorCatalog } from '../platform/errors/app-error';

const SEGMENT_ERRORS = {
  SEGMENT_NOT_FOUND: { status: 404, message: 'Segment not found' },
  SEGMENT_ARCHIVED: {
    status: 409,
    message: 'This segment is archived. Restore it before using it in a campaign',
  },
  SEGMENT_NAME_TAKEN: { status: 409, message: 'A segment with this name already exists' },
  SEGMENT_LIMIT_REACHED: {
    status: 409,
    message: `A store can save at most ${MAX_SEGMENTS_PER_STORE} segments`,
  },
  // A segment built from rules has no list to add a customer to.
  SEGMENT_NOT_HAND_PICKED: {
    status: 409,
    message: 'Only a segment made from picked customers can have customers added to it',
  },
  SEGMENT_HAND_PICKED_FULL: {
    status: 409,
    message: `A picked-customers segment holds at most ${MAX_HAND_PICKED_CONTACTS} customers`,
  },
  SEGMENT_NO_CUSTOMERS: { status: 404, message: 'None of these customers were found' },
  SEGMENT_HAND_PICKED_EMPTY: {
    status: 409,
    message: 'A picked-customers segment keeps at least one customer. Delete the segment instead',
  },
} as const satisfies ErrorCatalog;

export function segmentError(code: keyof typeof SEGMENT_ERRORS): AppError {
  return new AppError(code, SEGMENT_ERRORS[code]);
}
