'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { SignInResponse } from '@dakly/contracts/auth';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

import { useConfirmReset } from '../api/confirm-reset';
import { newPasswordSchema } from './new-password-schema';
import { PasswordMeter } from './password-meter';
import { FormField as AuthField } from '@/components/form-field';
import { formError } from '@/lib/form-error';

const resetSchema = z
  .object({ password: newPasswordSchema, confirmation: z.string() })
  .refine((value) => value.password === value.confirmation, {
    path: ['confirmation'],
    message: 'Passwords don’t match.',
  });
type ResetPasswordStepProps = {
  identifier: string;
  code: string;
  onReset: (result: SignInResponse) => void;
  onBadCode: () => void;
};
export function ResetPasswordStep({
  identifier,
  code,
  onReset,
  onBadCode,
}: ResetPasswordStepProps) {
  const form = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmation: '' },
  });
  const reset = useConfirmReset();
  // The code and the new password are checked together, so a wrong code shows up on this step.
  const [badCode, setBadCode] = useState(false);
  const errors = form.formState.errors;
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ password }) => {
        setBadCode(false);
        try {
          onReset(await reset.mutateAsync({ identifier, code, password, isRemembered: false }));
        } catch (error) {
          setBadCode(error instanceof ApiError && error.code === 'AUTH_CODE_INVALID');
          formError(error, form.setError);
        }
      })}
    >
      <AuthField
        label="New password"
        field={form.register('password')}
        error={errors.password}
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <PasswordMeter password={form.watch('password')} />
      <AuthField
        label="Confirm new password"
        field={form.register('confirmation')}
        error={errors.confirmation}
        type="password"
        autoComplete="new-password"
      />
      {errors.root ? (
        <ResetError message={errors.root.message} badCode={badCode} onBadCode={onBadCode} />
      ) : null}
      <Button type="submit" loading={reset.isPending} className="min-h-11 w-full font-semibold">
        Save new password
      </Button>
    </form>
  );
}

function ResetError({
  message,
  badCode,
  onBadCode,
}: {
  message?: string;
  badCode: boolean;
  onBadCode: () => void;
}) {
  return (
    <p role="alert" className="text-danger">
      {badCode ? 'That code is wrong or has expired.' : message}{' '}
      {badCode ? (
        <button type="button" onClick={onBadCode} className="font-semibold text-action underline">
          Enter the code again
        </button>
      ) : null}
    </p>
  );
}
