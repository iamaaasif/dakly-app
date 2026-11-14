'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { verifyEmailCodeSchema, type SignInResponse } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { useVerifyCode } from '../api/verify-code';
import { useVerifyEmailCode } from '../api/verify-email-code';
import { formError } from '../form-error';
import { AuthField } from './auth-field';
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
  return (
    <form
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
      <p>Enter the six-digit code we sent. Reloading this page starts sign-in again.</p>
      <AuthField
        label="Sign-in code"
        field={form.register('code')}
        error={form.formState.errors.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={phone.isPending || email.isPending}>
        Verify code
      </Button>
      <Button variant="secondary" onClick={onBack}>
        Change sign-in details
      </Button>
    </form>
  );
}
