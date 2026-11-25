'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { verifyCodeSchema, type SignUpInput } from '@dakly/contracts/auth';

import { useRequestCode } from '../api/request-code';
import { useVerifyCode } from '../api/verify-code';
import { useResendCountdown } from './use-resend-countdown';
import { formError } from '@/lib/form-error';

export function useSignUpVerification(
  account: { registration: SignUpInput; password?: string },
  options: { onAuthenticated?: () => void },
) {
  const countdown = useResendCountdown();
  const [challenge, setChallenge] = useState<string>();
  const form = useForm({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: {
      purpose: 'sign_up' as const,
      phone: account.registration.phone,
      email: account.registration.email,
      password: account.password,
      code: '',
    },
  });
  const verify = useVerifyCode();
  const request = useRequestCode();
  function complete() {
    if (options.onAuthenticated) options.onAuthenticated();
    else window.location.replace('/setup');
  }
  const submit = form.handleSubmit(async (input) => {
    try {
      const result = await verify.mutateAsync(input);
      form.resetField('code');
      if (result) setChallenge(result.challengeId);
      else complete();
    } catch (error) {
      formError(error, form.setError);
    }
  });
  async function resend() {
    try {
      await request.mutateAsync(account.registration);
      countdown.restart();
    } catch (error) {
      formError(error, form.setError);
    }
  }
  return {
    form,
    countdown,
    challenge,
    complete,
    submit,
    resend,
    pending: request.isPending || verify.isPending,
  };
}
