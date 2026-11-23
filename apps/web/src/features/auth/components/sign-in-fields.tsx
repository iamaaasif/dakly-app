import Link from 'next/link';
import { useFormContext } from 'react-hook-form';

import type { PasswordSignInInput } from '@dakly/contracts/auth';

import { authFieldClass, authPrefixedFieldClass } from './auth-control-class';
import { FormField as AuthField } from '@/components/form-field';

type IdentifierMode = { method: 'phone' | 'email'; unified: boolean };
function identifierField({ method, unified }: IdentifierMode) {
  if (unified)
    return {
      label: 'Email or mobile number',
      type: 'text',
      placeholder: 'you@business.com or 01712345678',
      className: authFieldClass,
    };
  if (method === 'phone')
    return {
      label: 'Mobile number',
      type: 'tel',
      placeholder: '1712345678',
      prefix: '+880',
      className: authPrefixedFieldClass,
    };
  return {
    label: 'Email',
    type: 'email',
    placeholder: 'you@business.com',
    className: authFieldClass,
  };
}

export function SignInFields({
  method,
  unified,
  onRemember,
}: {
  method: 'phone' | 'email';
  // One field for an email or a mobile number, since accounts made by SMS have no email.
  unified: boolean;
  onRemember: (value: boolean) => void;
}) {
  const form = useFormContext<PasswordSignInInput>();
  const errors = form.formState.errors;
  return (
    <>
      <AuthField
        {...identifierField({ method, unified })}
        field={form.register('identifier')}
        error={errors.identifier}
        autoComplete="username"
      />
      <AuthField
        className={authFieldClass}
        label="Password"
        placeholder="Your password"
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
          className="size-4.25 accent-inverse"
          {...form.register('isRemembered', {
            onChange: (event) => onRemember(Boolean(event.target.checked)),
          })}
        />
        Keep me signed in on this device
      </label>
    </>
  );
}
