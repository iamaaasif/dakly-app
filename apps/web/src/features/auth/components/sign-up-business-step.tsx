'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { BriefcaseBusiness, ChevronRight, Layers, ShoppingBag } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { signUpSchema, type SignUpInput } from '@dakly/contracts/auth';
import { storeOfferings } from '@dakly/contracts/stores';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { useRequestCode } from '../api/request-code';
import type { AuthConfig } from '../auth.types';
import type { BusinessDetails as ShopDetails } from '../first-shop';
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
  offering: z.enum(storeOfferings, { error: 'Choose what your business offers.' }),
});
type BusinessDetails = z.infer<typeof businessSchema>;
type SignUpBusinessStepProps = {
  account: AccountDetails;
  legal: NonNullable<AuthConfig['legal']>;
  onSent: (sent: { registration: SignUpInput; password: string; shop: ShopDetails }) => void;
};
export function SignUpBusinessStep({ account, legal, onSent }: SignUpBusinessStepProps) {
  const form = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: '', businessName: '', phone: '', websiteUrl: '' },
  });
  const request = useRequestCode();
  const errors = form.formState.errors;
  return (
    <form
      method="post"
      className="space-y-5.5"
      onSubmit={form.handleSubmit(async ({ name, phone, businessName, websiteUrl, offering }) => {
        const registration = {
          purpose: 'sign_up' as const,
          name,
          phone,
          email: account.email,
          termsVersion: legal.termsVersion,
          source: account.source,
          sourceOther: account.source === 'other' ? account.sourceOther || undefined : undefined,
        };
        try {
          await request.mutateAsync(registration);
          onSent({
            registration,
            password: account.password,
            shop: { businessName, websiteUrl: websiteUrl || undefined, offering },
          });
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
          <div
            role="radiogroup"
            aria-labelledby="offering-label"
            aria-required="true"
            className="space-y-2.5"
            onKeyDown={(event) => moveOffering(event, field.value, field.onChange)}
          >
            {offerings.map((offering, index) => (
              <OfferingCard
                key={offering.value}
                {...offering}
                on={field.value === offering.value}
                // One stop in the tab order, like a native radio group.
                tabbable={field.value ? field.value === offering.value : index === 0}
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
  tabbable: boolean;
  onPick: () => void;
};
function OfferingCard({ value, label, hint, on, tabbable, onPick }: OfferingCardProps) {
  const Icon = icons[value];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={tabbable ? 0 : -1}
      data-offering={value}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
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

// Arrow keys move the choice and the focus, as in a native radio group.
function moveOffering(
  event: KeyboardEvent<HTMLDivElement>,
  current: string | undefined,
  choose: (value: string) => void,
) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const at = offerings.findIndex((offering) => offering.value === current);
  const next = offerings[(at + step + offerings.length) % offerings.length]!;
  choose(next.value);
  event.currentTarget.querySelector<HTMLElement>(`[data-offering="${next.value}"]`)?.focus();
}
