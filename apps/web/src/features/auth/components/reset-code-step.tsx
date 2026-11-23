'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { verifyEmailCodeSchema } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useRequestReset } from '../api/request-reset';
import { useResendCountdown } from '../hooks/use-resend-countdown';
import { ResendLine } from './resend-line';
import { FormField as AuthField } from '@/components/form-field';
import { formError } from '@/lib/form-error';

const codeSchema = verifyEmailCodeSchema.pick({ code: true });
type ResetCodeStepProps = {
  identifier: string;
  onChange: () => void;
  onCode: (code: string) => void;
};
export function ResetCodeStep({ identifier, onChange, onCode }: ResetCodeStepProps) {
  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const countdown = useResendCountdown();
  const request = useRequestReset();
  async function resend() {
    try {
      await request.mutateAsync({ identifier });
      countdown.restart();
    } catch (error) {
      formError(error, form.setError);
    }
  }
  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={form.handleSubmit(({ code }) => onCode(code))}
    >
      <div className="flex flex-wrap items-center gap-2.5 rounded-control border border-border bg-background px-3 py-2.5">
        <Mail aria-hidden="true" size={16} className="text-text-muted" />
        <span className="min-w-0 flex-1 text-sm break-all">
          Code sent to <b className="font-semibold">{identifier}</b>
        </span>
        <button type="button" onClick={onChange} className="text-sm font-semibold text-action">
          Change
        </button>
      </div>
      <AuthField
        label="6-digit code"
        field={form.register('code')}
        error={form.formState.errors.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="••••••"
        className="min-h-14 rounded-control! text-center text-xl tracking-[0.4em]"
        autoFocus
      />
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" className="min-h-11 w-full font-semibold">
        Continue
      </Button>
      <ResendLine seconds={countdown.seconds} pending={request.isPending} onResend={resend} />
      <p className="text-center text-sm text-text-muted">
        Not in your inbox? Check Spam or Promotions. The code works for 10 minutes.
      </p>
    </form>
  );
}
