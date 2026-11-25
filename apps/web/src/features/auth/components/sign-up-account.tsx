'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';

import {
  emailSchema,
  passwordSchema,
  signUpSchema,
  type SignUpCodeChannel,
  type SignUpInput,
} from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';

import { useRequestCode } from '../api/request-code';
import type { AuthConfig } from '../auth.types';
import { authButtonClass } from './auth-control-class';
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
  channel,
  onSent,
}: {
  legal: NonNullable<AuthConfig['legal']>;
  channel: SignUpCodeChannel;
  onSent: (account: { registration: SignUpInput; password?: string }) => void;
}) {
  const form = useForm({
    resolver: zodResolver(
      channel === 'email'
        ? accountSchema.extend({ email: emailSchema })
        : accountSchema.required({ phone: true }),
    ),
    defaultValues: {
      purpose: 'sign_up' as const,
      name: '',
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
        <SignUpFields channel={channel} />
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
        <Button type="submit" loading={request.isPending} className={authButtonClass}>
          Send verification code
          <ChevronRight aria-hidden="true" size={16} />
        </Button>
      </form>
    </FormProvider>
  );
}
