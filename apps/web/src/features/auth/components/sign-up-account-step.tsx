'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronRight } from 'lucide-react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { emailSchema, signUpSources } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import type { AuthConfig } from '../auth.types';
import { authButtonClass, authFieldClass } from './auth-control-class';
import { newPasswordSchema } from './new-password-schema';
import { hearSources } from './sign-up-options';
import { FormField as AuthField } from '@/components/form-field';

const accountSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .superRefine((value, context) => {
      if (!emailSchema.safeParse(value).success)
        context.addIssue({
          code: 'custom',
          message: 'Enter a valid email, like you@business.com.',
        });
    }),
  password: newPasswordSchema,
  source: z.enum(signUpSources, { error: 'Tell us how you heard about Dakly.' }),
  sourceOther: z.string().trim().max(200),
});
export type AccountDetails = z.infer<typeof accountSchema>;
type SignUpAccountStepProps = {
  legal: NonNullable<AuthConfig['legal']>;
  initial?: AccountDetails;
  onNext: (details: AccountDetails) => void;
};
export function SignUpAccountStep({ legal, initial, onNext }: SignUpAccountStepProps) {
  const form = useForm({
    resolver: zodResolver(accountSchema),
    defaultValues: initial ?? { email: '', password: '', sourceOther: '' },
  });
  const errors = form.formState.errors;
  const password = form.watch('password');
  return (
    <form method="post" className="space-y-5.5" onSubmit={form.handleSubmit(onNext)}>
      <div className="space-y-4.5">
        <AuthField
          label="Email"
          field={form.register('email')}
          error={errors.email}
          autoComplete="email"
          placeholder="you@business.com"
          className={authFieldClass}
        />
        <div className="space-y-2">
          <AuthField
            label="Password"
            field={form.register('password')}
            error={errors.password}
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            className={authFieldClass}
          />
          <PasswordHints password={password} />
        </div>
        <SourceField form={form} />
      </div>
      <Button type="submit" className={authButtonClass}>
        Continue
        <ChevronRight aria-hidden="true" size={16} />
      </Button>
      <p className="text-center text-sm text-pretty text-text-muted">
        By signing up, you are creating a Dakly account, and you agree to Dakly’s{' '}
        <a
          href={legal.termsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-text underline"
        >
          Terms of Use
        </a>{' '}
        and{' '}
        <a
          href={legal.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-text underline"
        >
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}

function PasswordHints({ password }: { password: string }) {
  const hint = (ok: boolean) =>
    cn('flex items-center gap-1.5', ok ? 'text-success' : 'text-text-muted');
  return (
    <p className="flex gap-3.5 text-sm font-medium">
      <span className={hint(password.length >= 8)}>
        <Check aria-hidden="true" size={14} />
        8+ characters
      </span>
      <span className={hint(/\d/.test(password))}>
        <Check aria-hidden="true" size={14} />
        One number
      </span>
    </p>
  );
}

function SourceField({ form }: { form: UseFormReturn<AccountDetails> }) {
  const error = form.formState.errors.source;
  return (
    <>
      <div className="space-y-2">
        <label id="source-label" className="block font-semibold">
          How did you hear about us?
        </label>
        <Controller
          control={form.control}
          name="source"
          render={({ field }) => (
            <Select value={field.value ?? ''} onValueChange={field.onChange}>
              <SelectTrigger
                aria-labelledby="source-label"
                aria-invalid={Boolean(error)}
                className={authFieldClass}
              >
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {hearSources.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {error ? (
          <p role="alert" className="text-danger">
            {error.message}
          </p>
        ) : null}
      </div>
      {form.watch('source') === 'other' ? (
        <AuthField
          label="Where did you hear about us? (optional)"
          field={form.register('sourceOther')}
          placeholder="e.g. A friend recommended it"
          className={authFieldClass}
        />
      ) : null}
    </>
  );
}
