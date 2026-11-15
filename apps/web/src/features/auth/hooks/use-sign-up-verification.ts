'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { verifyCodeSchema, type SignUpInput } from '@dakly/contracts/auth';

import { useRequestCode } from '../api/request-code';
import { useVerifyCode } from '../api/verify-code';
import { formError } from '@/lib/form-error';

export function useSignUpVerification(
  account: { registration: SignUpInput; password: string },
  signupTicket: string | undefined,
  options: { isRemembered: boolean; onAuthenticated?: () => void },
) {
  const [seconds, setSeconds] = useState(30);
  const [challenge, setChallenge] = useState<string>();
  const form = useForm({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: {
      purpose: 'sign_up' as const,
      phone: account.registration.phone,
      password: account.password,
      signupTicket,
      code: '',
      isRemembered: options.isRemembered,
    },
  });
  const verify = useVerifyCode();
  const request = useRequestCode();
  useEffect(() => {
    const interval = setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(interval);
  }, []);
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
      setSeconds(30);
    } catch (error) {
      formError(error, form.setError);
    }
  }
  return {
    form,
    seconds,
    challenge,
    complete,
    submit,
    resend,
    pending: request.isPending || verify.isPending,
  };
}
