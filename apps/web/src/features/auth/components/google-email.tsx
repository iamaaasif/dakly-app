'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { verifyGoogleEmailSchema, type GoogleSignInResponse } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { useVerifyGoogleEmail } from '../api/verify-google-email';
import { formError } from '@/lib/form-error';
import { FormField as AuthField } from '@/components/form-field';
export function GoogleEmail({
  verificationTicket,
  isRemembered,
  onResult,
}: {
  verificationTicket: string;
  isRemembered: boolean;
  onResult: (result: GoogleSignInResponse) => void;
}) {
  const form = useForm({
    resolver: zodResolver(verifyGoogleEmailSchema),
    defaultValues: { verificationTicket, isRemembered, code: '' },
  });
  const verify = useVerifyGoogleEmail();
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          const result = await verify.mutateAsync(input);
          form.resetField('code');
          onResult(result);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p>Verify the email used by your Google account. Reloading starts sign-in again.</p>
      <AuthField
        label="Email verification code"
        field={form.register('code')}
        error={form.formState.errors.code}
        autoComplete="one-time-code"
        autoFocus
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={verify.isPending}>
        Verify email
      </Button>
    </form>
  );
}
