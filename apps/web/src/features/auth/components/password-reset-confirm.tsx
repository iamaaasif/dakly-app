'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { confirmPasswordResetSchema, passwordSchema } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { useConfirmReset } from '../api/confirm-reset';
import { formError } from '../form-error';
import { AuthField } from './auth-field';
import { TotpStep } from './totp-step';
const resetSchema = confirmPasswordResetSchema
  .extend({ confirmation: passwordSchema })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'The passwords must match.',
  });
type PasswordResetConfirmProps = { identifier: string };
export function PasswordResetConfirm({ identifier }: PasswordResetConfirmProps) {
  const [challenge, setChallenge] = useState<string>();
  const [done, setDone] = useState(false);
  const form = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { identifier, code: '', password: '', confirmation: '', isRemembered: false },
  });
  const reset = useConfirmReset();
  if (done) return <PasswordResetDone />;
  if (challenge) return <TotpStep challengeId={challenge} onSuccess={() => setDone(true)} />;
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ confirmation: _confirmation, ...input }) => {
        try {
          const result = await reset.mutateAsync(input);
          form.reset();
          if (result) setChallenge(result.challengeId);
          else setDone(true);
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <AuthField
        label="Reset code"
        field={form.register('code')}
        error={form.formState.errors.code}
        autoComplete="one-time-code"
        inputMode="numeric"
        autoFocus
      />
      <AuthField
        label="New password"
        field={form.register('password')}
        error={form.formState.errors.password}
        type="password"
        autoComplete="new-password"
      />
      <AuthField
        label="Confirm password"
        field={form.register('confirmation')}
        error={form.formState.errors.confirmation}
        type="password"
        autoComplete="new-password"
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={reset.isPending}>
        Reset password
      </Button>
    </form>
  );
}

function PasswordResetDone() {
  return (
    <div className="space-y-4">
      <p role="status">Your password has been reset. You are signed in.</p>
      <Link href="/dashboard" className="inline-flex min-h-10 items-center text-action underline">
        Continue to Dashboard
      </Link>
    </div>
  );
}
