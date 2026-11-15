import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { changeEmailSchema, type ChangeEmailInput } from '@dakly/contracts/auth';
import type { AccountProfile } from '@dakly/contracts/sessions';
import { Button } from '@dakly/ui/button';

import { useChangeEmail } from '../api/change-email';
import { useEmailProof } from '../api/email-proof';
import { securityFormError } from '../security-form-error';
import { EmailVerify } from './email-verify';
import { ProofFields } from './proof-fields';
import { FormField } from '@/components/form-field';

export function EmailForm({ profile, onDone }: { profile: AccountProfile; onDone: () => void }) {
  const [email, setEmail] = useState<string>();
  const [password, setPassword] = useState(profile.hasPassword);
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    shouldUnregister: true,
    defaultValues: { email: profile.email ?? '' },
  });
  const change = useChangeEmail();
  const proof = useEmailProof();
  const proofName = password ? 'currentPassword' : 'proofCode';
  if (email) return <EmailVerify email={email} onDone={onDone} />;
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await change.mutateAsync(input);
          setEmail(input.email);
          form.reset();
        } catch (error) {
          securityFormError(error, form.setError, proofName);
        } finally {
          change.reset();
        }
      })}
    >
      <FormField
        label="Email address"
        type="email"
        autoComplete="email"
        field={form.register('email')}
        error={form.formState.errors.email}
      />
      <p>
        Email verification keeps this account. It does not join or merge another account. A code
        proof is sent to your existing verified mobile number.
      </p>
      <ProofFields
        password={password}
        canUsePassword={profile.hasPassword}
        onMethod={setPassword}
        field={form.register(proofName)}
        error={form.getFieldState(proofName, form.formState).error}
        sending={proof.isPending}
        sent={proof.isSuccess}
        onSend={() => void sendEmailProof(form, proof)}
      />
      {form.formState.errors.root ? <p role="alert">{form.formState.errors.root.message}</p> : null}
      <Button type="submit" loading={change.isPending}>
        Send email verification code
      </Button>
    </form>
  );
}

async function sendEmailProof(
  form: ReturnType<typeof useForm<ChangeEmailInput>>,
  proof: ReturnType<typeof useEmailProof>,
) {
  if (!(await form.trigger('email'))) return;
  try {
    await proof.mutateAsync({ email: form.getValues('email') });
  } catch (error) {
    securityFormError(error, form.setError, 'proofCode');
  }
}
