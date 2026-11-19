import { AppError } from '../platform/errors/app-error';

export const contentPieceNotFound = () =>
  new AppError('CONTENT_PIECE_NOT_FOUND', { status: 404, message: 'Content piece not found' });
