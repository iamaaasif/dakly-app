'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { BriefcaseBusiness, ChevronRight, Layers, ShoppingBag } from 'lucide-react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { signUpSchema, type SignUpInput } from '@dakly/contracts/auth';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useRequestCode } from '../api/request-code';
import type { AuthConfig } from '../auth.types';
import { authButtonClass, authFieldClass, authPrefixedFieldClass } from './auth-control-class';
import type { AccountDetails } from './sign-up-account-step';
import { offerings } from './sign-up-options';
import { FormField as AuthField } from '@/components/form-field';
import { formError } from '@/lib/form-error';

const businessSchema = z.object({
  name: signUpSchema.shape.name,
  businessName: z.string().trim().min(1, 'Enter your business name.').max(120),
  phone: signUpSchema.shape.phone,
  websiteUrl: z
    .string()
    .trim()
    .refine((value) => !value || /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(value), {
      message: 'Enter a full link, like facebook.com/yourpage.',
    }),
  offering: z.string().min(1, 'Choose what your business offers.'),
});
type BusinessDetails = z.infer<typeof businessSchema>;
type SignUpBusinessStepProps = {
  account: AccountDetails;
  legal: NonNullable<AuthConfig['legal']>;
  onSent: (sent: { registration: SignUpInput; password: string }) => void;
};
export function SignUpBusinessStep({ account, legal, onSent }: SignUpBusinessStepProps) {
  const form = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: '', businessName: '', phone: '', websiteUrl: '', offering: '' },
  });
  const request = useRequestCode();
  const errors = form.formState.errors;
  return (
    <form
      method="post"
      className="space-y-5.5"
      onSubmit={form.handleSubmit(async ({ name, phone }) => {
        // TODO(backend): the business name, website, offering and source have no field on sign-up yet.
        const registration = {
          purpose: 'sign_up' as const,
          name,
          phone,
          email: account.email,
          termsVersion: legal.termsVersion,
        };
        try {
          await request.mutateAsync(registration);
          onSent({ registration, password: account.password });
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <BusinessFields form={form} />
      {errors.root ? (
        <p role="alert" className="text-danger">
          {errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={request.isPending} className={authButtonClass}>
        Create a free account
        <ChevronRight aria-hidden="true" size={16} />
      </Button>
      <p className="text-center text-sm text-text-muted">
        You can change these details any time in Settings.
      </p>
    </form>
  );
}

function BusinessFields({ form }: { form: UseFormReturn<BusinessDetails> }) {
  const errors = form.formState.errors;
  return (
    <div className="space-y-4.5">
      <div className="grid gap-x-3.5 gap-y-4.5 sm:grid-cols-2">
        <AuthField
          label="Your name"
          field={form.register('name')}
          error={errors.name}
          autoComplete="name"
          placeholder="e.g. Jakir Hossain"
          className={authFieldClass}
        />
        <AuthField
          label="Business name"
          field={form.register('businessName')}
          error={errors.businessName}
          autoComplete="organization"
          placeholder="e.g. Urban Trend"
          className={authFieldClass}
        />
      </div>
      <AuthField
        label="Phone number"
        field={form.register('phone')}
        error={errors.phone}
        type="tel"
        autoComplete="tel"
        prefix="+880"
        placeholder="1712 345678"
        className={authPrefixedFieldClass}
      />
      <AuthField
        label="Website or Facebook Page URL (optional)"
        field={form.register('websiteUrl')}
        error={errors.websiteUrl}
        autoComplete="url"
        placeholder="facebook.com/yourpage"
        className={authFieldClass}
      />
      <OfferingPicker form={form} />
    </div>
  );
}

const icons = { products: ShoppingBag, services: BriefcaseBusiness, both: Layers };
function OfferingPicker({ form }: { form: UseFormReturn<BusinessDetails> }) {
  const error = form.formState.errors.offering;
  return (
    <div className="space-y-2">
      <p id="offering-label" className="font-semibold">
        What does your business offer?
      </p>
      <Controller
        control={form.control}
        name="offering"
        render={({ field }) => (
          <div role="radiogroup" aria-labelledby="offering-label" className="space-y-2.5">
            {offerings.map((offering) => (
              <OfferingCard
                key={offering.value}
                {...offering}
                on={field.value === offering.value}
                onPick={() => field.onChange(offering.value)}
              />
            ))}
          </div>
        )}
      />
      {error ? (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

type OfferingCardProps = {
  value: keyof typeof icons;
  label: string;
  hint: string;
  on: boolean;
  onPick: () => void;
};
function OfferingCard({ value, label, hint, on, onPick }: OfferingCardProps) {
  const Icon = icons[value];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3.5 text-left',
        on ? 'border-inverse bg-background ring-1 ring-inverse' : 'border-border-strong',
      )}
    >
      <span
        className={cn(
          'flex size-9.5 shrink-0 items-center justify-center rounded-control',
          on ? 'bg-inverse text-on-primary' : 'bg-surface-muted text-text-muted',
        )}
      >
        <Icon aria-hidden="true" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-text-muted">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'size-4.5 shrink-0 rounded-full border',
          on ? 'border-5 border-inverse' : 'border-input-border',
        )}
      />
    </button>
  );
}
