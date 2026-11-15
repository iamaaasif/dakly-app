'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { staffSignInSchema, type StaffSignInInput } from '@dakly/contracts/staff-auth';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useStaffSignIn } from '../api/sign-in';
import { AuthPanel } from './auth-panel';
import { FactorChallenge } from './factor-challenge';

export function SignInScreen() {
  const signIn = useStaffSignIn();
  const form = useForm<StaffSignInInput>({
    resolver: zodResolver(staffSignInSchema),
    defaultValues: { email: '', password: '' },
  });
  return (
    <AuthPanel
      title="Staff sign-in"
      description="Use your staff email and password, then verify with your passkey or authenticator."
    >
      {signIn.data ? (
        <FactorChallenge signIn={signIn.data} />
      ) : (
        <form
          method="post"
          className="space-y-4"
          onSubmit={form.handleSubmit((input) => signIn.mutate(input))}
        >
          <label className="grid gap-2 font-medium">
            Staff email
            <Input
              {...form.register('email')}
              type="email"
              autoComplete="username"
              aria-invalid={Boolean(form.formState.errors.email)}
              aria-describedby="email-error"
            />
          </label>
          <p id="email-error" role="alert" className="text-danger">
            {form.formState.errors.email ? 'Enter your staff email address.' : null}
          </p>
          <label className="grid gap-2 font-medium">
            Password
            <Input
              {...form.register('password')}
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              aria-describedby="password-error"
            />
          </label>
          <p id="password-error" role="alert" className="text-danger">
            {form.formState.errors.password ? 'Enter your password.' : null}
          </p>
          <p role="alert" className="text-danger">
            {signIn.error?.message}
          </p>
          <Button type="submit" className="w-full" loading={signIn.isPending}>
            Continue
          </Button>
          <Link className="inline-flex min-h-10 items-center text-action underline" href="/enroll">
            Set up a provisioned account
          </Link>
        </form>
      )}
    </AuthPanel>
  );
}
