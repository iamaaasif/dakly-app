'use client';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { totpSignInSchema } from '@dakly/contracts/totp';
import { Button } from '@dakly/ui/button';
import { useVerifyTotp } from '../api/verify-totp';
import { formError } from '@/lib/form-error';
import { AuthField } from './auth-field';
export function TotpStep({
  challengeId,
  onSuccess,
}: {
  challengeId: string;
  onSuccess: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(totpSignInSchema),
    defaultValues: { challengeId, code: '' },
  });
  const verify = useVerifyTotp();
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await verify.mutateAsync(input);
          form.reset();
          onSuccess();
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <h2 className="text-lg font-semibold">Two-step verification</h2>
      <p>Use your authenticator or one unused backup code. Reloading starts sign-in again.</p>
      <AuthField
        label="Authenticator or backup code"
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
        Finish sign-in
      </Button>
      <Link href="/security/recovery" className="flex min-h-10 items-center text-action underline">
        Lost your authenticator?
      </Link>
    </form>
  );
}
