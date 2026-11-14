'use client';
import Link from 'next/link';
import { FormProvider } from 'react-hook-form';
import { useSignInForm } from '../hooks/use-sign-in-form';
import { SignInFields } from './sign-in-fields';
import type { SignInResponse } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { formError } from '@/lib/form-error';
import { SignInCode } from './sign-in-code';
type SignInFormProps = {
  method: 'phone' | 'email';
  isRemembered: boolean;
  onResult: (result: SignInResponse) => void;
  onRemember: (remember: boolean) => void;
};
export function SignInForm({ method, isRemembered, onResult, onRemember }: SignInFormProps) {
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
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending}>
            Sign in
          </Button>
          <Button variant="secondary" loading={pending} onClick={requestCode}>
            Get a code
          </Button>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-10 items-center text-action underline"
        >
          Forgot password?
        </Link>
      </form>
    </FormProvider>
  );
}
