import { useFormContext } from 'react-hook-form';
import type { PasswordSignInInput } from '@dakly/contracts/auth';
import { FormField as AuthField } from '@/components/form-field';
export function SignInFields({
  method,
  onRemember,
}: {
  method: 'phone' | 'email';
  onRemember: (value: boolean) => void;
}) {
  const form = useFormContext<PasswordSignInInput>();
  const errors = form.formState.errors;
  return (
    <>
      <AuthField
        label={method === 'phone' ? 'Mobile number' : 'Email'}
        field={form.register('identifier')}
        error={errors.identifier}
        type={method === 'email' ? 'email' : 'tel'}
        autoComplete="username"
        hint={method === 'phone' ? '+880 · Enter your Bangladeshi mobile number.' : undefined}
      />
      <AuthField
        label="Password"
        field={form.register('password')}
        error={errors.password}
        type="password"
        autoComplete="current-password"
      />
      <label className="flex min-h-10 items-center gap-3">
        <input
          type="checkbox"
          {...form.register('isRemembered', {
            onChange: (event) => onRemember(Boolean(event.target.checked)),
          })}
        />
        Keep me signed in on this device
      </label>
    </>
  );
}
