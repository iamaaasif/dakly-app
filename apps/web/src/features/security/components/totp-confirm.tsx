import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { totpConfirmSchema, type TotpSetupResponse } from '@dakly/contracts/totp';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { FormField } from '@/components/form-field';
import { securityFormError } from '../security-form-error';
import { useConfirmTotp } from '../api/confirm-totp';
export function TotpConfirm({
  setup,
  onConfirmed,
}: {
  setup: TotpSetupResponse;
  onConfirmed: (codes: string[]) => void;
}) {
  const form = useForm({
    resolver: zodResolver(totpConfirmSchema),
    defaultValues: { setupId: setup.setupId, code: '' },
  });
  const confirm = useConfirmTotp();
  const secret = new URL(setup.uri).searchParams.get('secret') ?? '';
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          const result = await confirm.mutateAsync(input);
          form.reset();
          onConfirmed(result.backupCodes);
        } catch (error) {
          securityFormError(error, form.setError, 'code');
        } finally {
          confirm.reset();
        }
      })}
    >
      <p>
        Add a time-based account in your authenticator with this private key. Use six digits and a
        30-second period. Setup expires after five minutes; close and start again if it expires.
      </p>
      <label htmlFor="authenticator-key" className="block font-medium">
        Authenticator setup key
      </label>
      <Input id="authenticator-key" value={secret} readOnly autoComplete="off" />
      <input type="hidden" {...form.register('setupId')} />
      <FormField
        label="Authenticator code"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        field={form.register('code')}
        error={form.formState.errors.code}
      />
      {form.formState.errors.root ? <p role="alert">{form.formState.errors.root.message}</p> : null}
      <Button type="submit" loading={confirm.isPending}>
        Enable two-step verification
      </Button>
    </form>
  );
}
