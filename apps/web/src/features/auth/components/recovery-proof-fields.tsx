import { useFormContext } from 'react-hook-form';

import type { RecoveryFormInput } from '../hooks/use-recovery-request';
import { FormField as AuthField } from '@/components/form-field';

export function RecoveryProofFields() {
  const form = useFormContext<RecoveryFormInput>();
  const errors = form.formState.errors;
  return (
    <>
      <AuthField
        label="Mobile code (if you have a mobile)"
        field={form.register('phoneCode')}
        error={errors.phoneCode}
        inputMode="numeric"
        autoComplete="one-time-code"
      />
      <AuthField
        label="Verified email code (if you have one)"
        field={form.register('emailCode')}
        error={errors.emailCode}
        inputMode="numeric"
        autoComplete="off"
      />
      <AuthField
        label="Password (if you set one)"
        field={form.register('password')}
        error={errors.password}
        type="password"
        autoComplete="current-password"
      />
    </>
  );
}
