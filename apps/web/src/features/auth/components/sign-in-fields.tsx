import Link from 'next/link';
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
        prefix={method === 'phone' ? '+880' : undefined}
        placeholder={method === 'phone' ? '1712345678' : 'you@example.com'}
      />
      <AuthField
        label="Password"
        field={form.register('password')}
        error={errors.password}
        type="password"
        autoComplete="current-password"
        labelAside={
          <Link href="/forgot-password" className="font-semibold text-action underline">
            Forgot password?
          </Link>
        }
      />
      <label className="flex min-h-10 items-center gap-3">
        <input
          type="checkbox"
          className="size-4 accent-action"
          {...form.register('isRemembered', {
            onChange: (event) => onRemember(Boolean(event.target.checked)),
          })}
        />
        Keep me signed in on this device
      </label>
    </>
  );
}
