'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';

import { passwordSchema, signUpSchema, type SignUpInput } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useRequestCode } from '../api/request-code';
import type { AuthConfig } from '../auth.types';
import { SignUpConsent } from './sign-up-consent';
import { SignUpFields } from './sign-up-fields';
import { formError } from '@/lib/form-error';

const consentSchema = z.literal(true, {
  error: 'Read and agree to the Terms and Privacy documents.',
});
const accountSchema = signUpSchema.extend({
  password: z.union([passwordSchema, z.literal('').transform(() => undefined)]),
  consent: consentSchema,
  email: z.union([signUpSchema.shape.email, z.literal('').transform(() => undefined)]),
});
export function SignUpAccount({
  legal,
  onSent,
}: {
  legal: NonNullable<AuthConfig['legal']>;
  onSent: (account: { registration: SignUpInput; password?: string }) => void;
}) {
  const form = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      purpose: 'sign_up' as const,
      name: '',
      phone: '',
      email: '',
      password: '',
      termsVersion: legal.termsVersion,
    },
  });
  const request = useRequestCode();
  const errors = form.formState.errors;
  return (
    <FormProvider {...form}>
      <form
        method="post"
        className="space-y-4"
        onSubmit={form.handleSubmit(async ({ password, consent: _consent, ...registration }) => {
          try {
            await request.mutateAsync(registration);
            onSent({ registration, password });
          } catch (error) {
            formError(error, form.setError);
          }
        })}
      >
        <SignUpFields />
        <SignUpConsent legal={legal} />
        {errors.root ? (
          <p role="alert" className="text-danger">
            {errors.root.message}
          </p>
        ) : null}
        <p className="text-sm text-text-muted">
          Before verification, reloading clears these details. After verification, you can sign in
          again to finish shop setup.
        </p>
        <Button type="submit" loading={request.isPending}>
          Send verification code
        </Button>
      </form>
    </FormProvider>
  );
}
