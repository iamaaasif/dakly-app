import type { FieldValues, UseFormSetError } from 'react-hook-form';

import { useRequestCode } from '../api/request-code';
import { useRequestEmailCode } from '../api/request-email-code';
import { useResendCountdown } from './use-resend-countdown';
import { formError } from '@/lib/form-error';

export function useCodeResend<T extends FieldValues>(
  method: 'phone' | 'email',
  identifier: string,
  setError: UseFormSetError<T>,
) {
  const countdown = useResendCountdown();
  const phone = useRequestCode();
  const email = useRequestEmailCode();
  async function resend() {
    try {
      if (method === 'phone') await phone.mutateAsync({ purpose: 'sign_in', phone: identifier });
      else await email.mutateAsync({ email: identifier });
      countdown.restart();
    } catch (error) {
      formError(error, setError);
    }
  }
  return { countdown, sending: phone.isPending || email.isPending, resend };
}
