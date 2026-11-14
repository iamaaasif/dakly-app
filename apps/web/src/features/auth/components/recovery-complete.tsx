'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { totpRecoveryTokenSchema } from '@dakly/contracts/totp';
import { Button } from '@dakly/ui/button';
import { useCompleteRecovery } from '../api/complete-recovery';
import { formError } from '../form-error';
import { AuthField } from './auth-field';
export function RecoveryComplete() {
  const form = useForm({
    resolver: zodResolver(totpRecoveryTokenSchema),
    defaultValues: { recoveryId: '', token: '' },
  });
  const complete = useCompleteRecovery();
  if (complete.isSuccess)
    return (
      <p role="status">
        Recovery completed. Two-step verification was removed and all sessions were signed out. Sign
        in again to continue.
      </p>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await complete.mutateAsync(input);
          form.reset();
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <p>
        Enter the reference and completion key saved when you requested recovery. Recovery can
        finish only after the full waiting period.
      </p>
      <AuthField
        label="Recovery reference"
        field={form.register('recoveryId')}
        error={form.formState.errors.recoveryId}
        autoComplete="off"
      />
      <AuthField
        label="Completion key"
        field={form.register('token')}
        error={form.formState.errors.token}
        type="password"
        autoComplete="off"
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={complete.isPending}>
        Complete recovery
      </Button>
    </form>
  );
}
