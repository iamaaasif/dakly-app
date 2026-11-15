import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { totpDisableSchema } from '@dakly/contracts/totp';
import { Button } from '@dakly/ui/button';

import { useDisableTotp } from '../api/disable-totp';
import { securityFormError } from '../security-form-error';
import { FormField } from '@/components/form-field';

export function TotpDisable({ onDone }: { onDone: () => void }) {
  const form = useForm({ resolver: zodResolver(totpDisableSchema), defaultValues: { code: '' } });
  const disable = useDisableTotp();
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await disable.mutateAsync(input);
          form.reset();
          onDone();
        } catch (error) {
          securityFormError(error, form.setError, 'code');
        } finally {
          disable.reset();
        }
      })}
    >
      <p>
        Disable two-step verification for your account? Sign-in will no longer require your
        authenticator.
      </p>
      <FormField
        label="Authenticator or backup code"
        type="password"
        autoComplete="one-time-code"
        field={form.register('code')}
        error={form.formState.errors.code}
      />
      {form.formState.errors.root ? <p role="alert">{form.formState.errors.root.message}</p> : null}
      <Button type="submit" variant="danger" loading={disable.isPending}>
        Disable two-step verification
      </Button>
    </form>
  );
}
