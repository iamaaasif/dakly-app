'use client';
import { MessageSquare } from 'lucide-react';

import type { SignUpInput } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useSignUpVerification } from '../hooks/use-sign-up-verification';
import { ResendLine } from './resend-line';
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
  const { form, countdown, challenge, complete, submit, resend, pending } = useSignUpVerification(
    account,
    { onAuthenticated },
  );
  if (challenge) return <TotpStep challengeId={challenge} onSuccess={complete} />;
  return (
    <form method="post" className="space-y-4" onSubmit={submit}>
      <div className="flex flex-wrap items-center gap-2.5 rounded-control border border-border bg-background px-3 py-2.5">
        <MessageSquare aria-hidden="true" size={16} className="text-text-muted" />
        <span className="min-w-0 flex-1 text-sm break-all">
          Code sent by SMS to{' '}
          <b className="font-semibold">+880 {formatPhone(account.registration.phone)}</b>
        </span>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-action">
          Change
        </button>
      </div>
      <AuthField
        label="6-digit code"
        field={form.register('code')}
        error={form.formState.errors.code}
        inputMode="numeric"
        maxLength={6}
        className="min-h-14 rounded-control! text-center text-xl tracking-[0.4em]"
        autoComplete="one-time-code"
        autoFocus
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="min-h-11 w-full font-semibold">
        Verify mobile
      </Button>
      <ResendLine seconds={countdown.seconds} pending={pending} onResend={resend} />
      <p className="text-sm text-text-muted">
        Reloading starts account registration again. Your password and code are not saved on this
        device.
      </p>
    </form>
  );
}

// 01712345678 is shown as 1712 345678 after the +880 prefix.
function formatPhone(phone: string) {
  const national = phone.replace(/^0/, '');
  return `${national.slice(0, 4)} ${national.slice(4)}`;
}
