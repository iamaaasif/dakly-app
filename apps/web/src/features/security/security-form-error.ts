import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@dakly/ui/api-client';
import { formError } from '@/lib/form-error';
export function securityFormError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  proofField: Path<T>,
) {
  formError(error, setError);
  if (!(error instanceof ApiError)) return;
  if (error.code === 'AUTH_EMAIL_TAKEN') setError('email' as Path<T>, { message: error.message });
  if (
    [
      'AUTH_CODE_INVALID',
      'AUTH_TOTP_INVALID',
      'AUTH_PROOF_REQUIRED',
      'AUTH_INVALID_CREDENTIALS',
    ].includes(error.code)
  )
    setError(proofField, { message: error.message });
}
