import { useFormContext } from 'react-hook-form';

import { type SignUpInput } from '@dakly/contracts/auth';

import { PasswordStrength } from './password-strength';
import { FormField as AuthField } from '@/components/form-field';

export function SignUpFields() {
  const form = useFormContext<SignUpInput & { password: string }>();
  const errors = form.formState.errors;
  const password = form.watch('password');
  return (
    <>
      <AuthField
        label="Full name"
        field={form.register('name')}
        error={errors.name}
        autoComplete="name"
      />
      <AuthField
        label="Mobile number"
        field={form.register('phone')}
        error={errors.phone}
        type="tel"
        autoComplete="tel"
        hint="+880 · Use your own Bangladeshi mobile number."
      />
      <AuthField
        label="Email (optional)"
        field={form.register('email')}
        error={errors.email}
        type="email"
        autoComplete="email"
      />
      <AuthField
        label="Password (optional)"
        field={form.register('password')}
        error={errors.password}
        type="password"
        autoComplete="new-password"
        hint="Skip it to sign in with a code each time. A password needs 8 characters and a number."
      />
      {password ? <PasswordStrength password={password} /> : null}
    </>
  );
}
