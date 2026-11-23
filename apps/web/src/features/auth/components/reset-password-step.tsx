'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { SignInResponse } from '@dakly/contracts/auth';
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
  const errors = form.formState.errors;
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ password }) => {
        try {
          onReset(await reset.mutateAsync({ identifier, code, password, isRemembered: false }));
        } catch (error) {
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
        <p role="alert" className="text-danger">
          {errors.root.message}{' '}
          <button type="button" onClick={onBadCode} className="font-semibold text-action underline">
            Enter the code again
          </button>
        </p>
      ) : null}
      <Button type="submit" loading={reset.isPending} className="min-h-11 w-full font-semibold">
        Save new password
      </Button>
    </form>
  );
}
