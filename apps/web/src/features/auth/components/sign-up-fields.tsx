import { useFormContext } from 'react-hook-form';

import { passwordSchema, type SignUpInput } from '@dakly/contracts/auth';

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
        label="Password"
        field={form.register('password')}
        error={errors.password}
        type="password"
        autoComplete="new-password"
        hint="Use at least 8 characters with a number."
      />
      <p role="status">
        {passwordSchema.safeParse(password).success
          ? 'Password meets the requirements.'
          : 'Add at least 8 characters and a number.'}
      </p>
    </>
  );
}
