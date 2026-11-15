import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { verifyNewEmailSchema } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useVerifyEmail } from '../api/verify-email';
import { securityFormError } from '../security-form-error';
import { FormField } from '@/components/form-field';

export function EmailVerify({ email, onDone }: { email: string; onDone: () => void }) {
  const form = useForm({
    resolver: zodResolver(verifyNewEmailSchema),
    defaultValues: { email, code: '' },
  });
  const verify = useVerifyEmail();
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await verify.mutateAsync(input);
          onDone();
        } catch (error) {
          securityFormError(error, form.setError, 'code');
        } finally {
          verify.reset();
        }
      })}
    >
      <p>
        A verification code was sent to {email}. Your account email changes only after you verify
        this mailbox.
      </p>
      <FormField
        label="Email address"
        type="email"
        readOnly
        field={form.register('email')}
        error={form.formState.errors.email}
      />
      <FormField
        label="Email verification code"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        field={form.register('code')}
        error={form.formState.errors.code}
      />
      {form.formState.errors.root ? <p role="alert">{form.formState.errors.root.message}</p> : null}
      <Button type="submit" loading={verify.isPending}>
        Verify email
      </Button>
    </form>
  );
}
