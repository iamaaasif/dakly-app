'use client';
import type { SignUpInput } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useSignUpVerification } from '../hooks/use-sign-up-verification';
import { TotpStep } from './totp-step';
import { FormField as AuthField } from '@/components/form-field';

export function SignUpVerify({
  account,
  onBack,
  onAuthenticated,
}: {
  account: { registration: SignUpInput; password?: string };
  onBack: () => void;
  onAuthenticated?: () => void;
}) {
  const { form, seconds, challenge, complete, submit, resend, pending } = useSignUpVerification(
    account,
    { onAuthenticated },
  );
  if (challenge) return <TotpStep challengeId={challenge} onSuccess={complete} />;
  return (
    <form method="post" className="space-y-4" onSubmit={submit}>
      <p>Enter the six-digit SMS code. It expires after ten minutes.</p>
      <AuthField
        label="Verification code"
        field={form.register('code')}
        error={form.formState.errors.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          Verify mobile
        </Button>
        <Button variant="secondary" disabled={seconds > 0} loading={pending} onClick={resend}>
          {seconds ? `Resend in ${seconds}s` : 'Resend code'}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Change number
        </Button>
      </div>
      <p className="text-sm text-text-muted">
        Reloading starts account registration again. Your password and code are not saved on this
        device.
      </p>
    </form>
  );
}
