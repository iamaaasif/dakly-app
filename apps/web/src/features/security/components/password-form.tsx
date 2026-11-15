import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '@dakly/contracts/auth';
import type { AccountProfile } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';
import { FormField } from '@/components/form-field';
import { securityFormError } from '../security-form-error';
import { useChangePassword } from '../api/change-password';
import { usePasswordProof } from '../api/password-proof';
import { ProofFields } from './proof-fields';
export function PasswordForm({ profile, onDone }: { profile: AccountProfile; onDone: () => void }) {
  const [password, setPassword] = useState(profile.hasPassword);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    shouldUnregister: true,
  });
  const change = useChangePassword();
  const proof = usePasswordProof();
  const proofName = password ? 'currentPassword' : 'proofCode';
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await change.mutateAsync(input);
          form.reset();
          onDone();
        } catch (error) {
          securityFormError(error, form.setError, proofName);
        } finally {
          change.reset();
        }
      })}
    >
      <ProofFields
        password={password}
        canUsePassword={profile.hasPassword}
        onMethod={setPassword}
        field={form.register(proofName)}
        error={form.getFieldState(proofName, form.formState).error}
        sending={proof.isPending}
        sent={proof.isSuccess}
        onSend={() =>
          void proof
            .mutateAsync()
            .catch((error) => securityFormError(error, form.setError, proofName))
        }
      />
      <FormField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="Use at least 8 characters including a number."
        field={form.register('password')}
        error={form.formState.errors.password}
      />
      {form.formState.errors.root ? <p role="alert">{form.formState.errors.root.message}</p> : null}
      <Button type="submit" loading={change.isPending}>
        Save password
      </Button>
    </form>
  );
}
