import { ApiError } from '@dakly/ui/api-client';

export function isPhoneTaken(error: Error) {
  return error instanceof ApiError && error.code === 'CONTACT_PHONE_TAKEN';
}
