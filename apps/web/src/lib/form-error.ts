import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
export function formError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>) {
  if (error instanceof ApiError && error.fields) {
    for (const { path, message } of error.fields) setError(path as Path<T>, { message });
  }
  const message =
    error instanceof Error ? error.message : 'Could not complete the request. Try again.';
  setError('root', { message });
}
