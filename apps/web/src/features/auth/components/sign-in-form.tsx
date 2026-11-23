'use client';
import { ChevronRight, Mail, Phone } from 'lucide-react';
import { FormProvider } from 'react-hook-form';

import type { SignInResponse } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useSignInForm } from '../hooks/use-sign-in-form';
import { authButtonClass } from './auth-control-class';
import { SignInCode } from './sign-in-code';
import { SignInFields } from './sign-in-fields';
import { formError } from '@/lib/form-error';

type SignInFormProps = {
  method: 'phone' | 'email';
  isRemembered: boolean;
  onResult: (result: SignInResponse) => void;
  onRemember: (remember: boolean) => void;
  // Sign-in by a one-time code, offered inside an invitation.
  showCode?: boolean;
  submitLabel?: string;
};
export function SignInForm({
  method,
  isRemembered,
  onResult,
  onRemember,
  showCode = false,
  submitLabel = 'Sign in',
}: SignInFormProps) {
  const { form, password, pending, codeTarget, setCodeTarget, requestCode } = useSignInForm(
    method,
    isRemembered,
  );
  const errors = form.formState.errors;
  if (codeTarget)
    return (
      <SignInCode
        target={codeTarget}
        method={method}
        onResult={onResult}
        onBack={() => setCodeTarget(null)}
      />
    );
  return (
    <FormProvider {...form}>
      <form
        method="post"
        className="space-y-4"
        onSubmit={form.handleSubmit(async (input) => {
          try {
            onResult(await password.mutateAsync(input));
            form.resetField('password');
          } catch (error) {
            formError(error, form.setError);
          }
        })}
      >
        <SignInFields method={method} onRemember={onRemember} />
        {errors.root ? (
          <p role="alert" className="text-danger">
            {errors.root.message}
          </p>
        ) : null}
        <SignInActions
          method={method}
          pending={pending}
          submitLabel={submitLabel}
          onRequestCode={showCode ? requestCode : undefined}
        />
      </form>
    </FormProvider>
  );
}

function SignInActions({
  method,
  pending,
  submitLabel,
  onRequestCode,
}: {
  method: 'phone' | 'email';
  pending: boolean;
  submitLabel: string;
  onRequestCode?: () => void;
}) {
  return (
    <>
      <Button type="submit" loading={pending} className={authButtonClass}>
        {submitLabel}
        <ChevronRight aria-hidden="true" size={16} />
      </Button>
      {onRequestCode ? (
        <Button variant="link" loading={pending} onClick={onRequestCode} className="w-full">
          {method === 'phone' ? (
            <Phone aria-hidden="true" size={16} />
          ) : (
            <Mail aria-hidden="true" size={16} />
          )}
          Get a code by {method === 'phone' ? 'SMS' : 'email'}
        </Button>
      ) : null}
    </>
  );
}
