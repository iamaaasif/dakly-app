'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { verifyEmailCodeSchema, type SignInResponse } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useVerifyCode } from '../api/verify-code';
import { useVerifyEmailCode } from '../api/verify-email-code';
import { useCodeResend } from '../hooks/use-code-resend';
import { authButtonClass } from './auth-control-class';
import { ResendButton } from './resend-button';
import { FormField as AuthField } from '@/components/form-field';
import { formError } from '@/lib/form-error';

const codeSchema = verifyEmailCodeSchema.pick({ code: true });
type SignInCodeProps = {
  target: { identifier: string; isRemembered: boolean };
  method: 'phone' | 'email';
  onResult: (result: SignInResponse) => void;
  onBack: () => void;
};
export function SignInCode({ target, method, onResult, onBack }: SignInCodeProps) {
  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const phone = useVerifyCode();
  const email = useVerifyEmailCode();
  const pending = phone.isPending || email.isPending;
  const { countdown, sending, resend } = useCodeResend(method, target.identifier, form.setError);
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ code }) => {
        try {
          const result =
            method === 'phone'
              ? await phone.mutateAsync({
                  purpose: 'sign_in',
                  phone: target.identifier,
                  code,
                  isRemembered: target.isRemembered,
                })
              : await email.mutateAsync({
                  email: target.identifier,
                  code,
                  isRemembered: target.isRemembered,
                });
          form.reset();
          onResult(result);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p>Enter the six-digit code we sent to {target.identifier}. It expires after ten minutes.</p>
      <AuthField
        label="Sign-in code"
        field={form.register('code')}
        error={form.formState.errors.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="min-h-14 rounded-control! text-center text-xl tracking-widest"
        autoFocus
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className={authButtonClass}>
        Verify code
      </Button>
      <div className="flex flex-wrap gap-3">
        <ResendButton {...countdown} loading={sending} onClick={resend} />
        <Button variant="secondary" onClick={onBack}>
          Change sign-in details
        </Button>
      </div>
    </form>
  );
}
