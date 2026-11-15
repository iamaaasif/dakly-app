'use client';
import { FormProvider } from 'react-hook-form';

import { Button } from '@dakly/ui/button';

import { useRecoveryRequest } from '../hooks/use-recovery-request';
import { RecoveryProof } from './recovery-proof';
import { RecoveryProofFields } from './recovery-proof-fields';
import { FormField as AuthField } from '@/components/form-field';

export function RecoveryRequest() {
  const { form, proof, sent, errors, send, submit, pending } = useRecoveryRequest();
  if (proof) return <RecoveryProof proof={proof} />;
  return (
    <FormProvider {...form}>
      <form method="post" className="space-y-4" onSubmit={submit}>
        <p>
          Use this if you have lost your authenticator and backup codes. Verify your mobile, your
          verified email if you have one, and your password if you set one. Recovery waits at least
          seven days after all security notices are delivered.
        </p>
        <AuthField
          label="Mobile number"
          field={form.register('phone')}
          error={errors.phone}
          type="tel"
          autoComplete="tel"
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" loading={pending} onClick={() => send('phone')}>
            Send mobile code
          </Button>
          <Button variant="secondary" loading={pending} onClick={() => send('email')}>
            Send verified email code
          </Button>
        </div>
        {sent ? <p role="status">{sent}</p> : null}
        <RecoveryProofFields />
        {errors.root ? (
          <p role="alert" className="text-danger">
            {errors.root.message}
          </p>
        ) : null}
        <Button type="submit" loading={pending}>
          Request recovery
        </Button>
      </form>
    </FormProvider>
  );
}
