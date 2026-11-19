import { AppError } from '../platform/errors/app-error';

export const contentPieceNotFound = () =>
  new AppError('CONTENT_PIECE_NOT_FOUND', { status: 404, message: 'Content piece not found' });

const writeErrors = {
  CONTENT_DRAFT_INVALID: { status: 400, message: 'Choose an AI draft from this shop' },
  CONTENT_TIMEOUT: { status: 504, message: 'Writing timed out' },
  CONTENT_INVALID: { status: 502, message: 'Could not write options with those details' },
  CONTENT_CREDITS_UNAVAILABLE: { status: 409, message: 'There are not enough AI credits' },
  CONTENT_UNAVAILABLE: { status: 503, message: 'AI writing is unavailable' },
};

export function contentWriteError(code: keyof typeof writeErrors): AppError {
  return new AppError(code, writeErrors[code]);
}
