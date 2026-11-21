'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';

import type { PlansResponse } from '@dakly/contracts/billing';
import { createStoreSchema } from '@dakly/contracts/stores';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

import { useCreateStore } from '../api/create-store';
import type { BusinessDraft } from '../auth.types';
import { BillingCycle } from './billing-cycle';
import { PlanChoice } from './plan-choice';
import { formError } from '@/lib/form-error';

type PlanFormProps = {
  draft: BusinessDraft;
  onBack: () => void;
  onCreated: () => void;
  plans: PlansResponse;
};
export function PlanForm({ draft, onBack, onCreated, plans }: PlanFormProps) {
  const create = useCreateStore();
  const router = useRouter();
  const pathname = usePathname();
  const cycle: 'monthly' | 'yearly' =
    useSearchParams().get('cycle') === 'yearly' ? 'yearly' : 'monthly';
  const form = useForm({
    resolver: zodResolver(createStoreSchema),
    defaultValues: { ...draft, planCode: '', billingCycle: cycle },
  });
  function chooseCycle(value: 'monthly' | 'yearly') {
    form.setValue('billingCycle', value);
    router.replace(`${pathname}?cycle=${value}`, { scroll: false });
  }
  return (
    <form
      method="post"
      className="space-y-6"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await create.mutateAsync(input);
          onCreated();
          window.location.replace('/dashboard');
        } catch (error) {
          if (error instanceof ApiError && error.code === 'PLAN_NEEDS_PAYMENT')
            form.setError('root', {
              message: 'Payment is required. Checkout is not available yet. Choose another plan.',
            });
          else formError(error, form.setError);
        }
      })}
    >
      <BillingCycle cycle={cycle} chooseCycle={chooseCycle} />
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.plans.map((plan) => (
          <PlanChoice
            key={plan.code}
            plan={plan}
            cycle={cycle}
            recommended={plans.recommendations[draft.customerListSize] === plan.code}
            pending={create.isPending}
            onChoose={() => form.setValue('planCode', plan.code)}
          />
        ))}
      </div>
      {form.formState.errors.root ? (
        <p role="alert" className="text-danger">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button variant="secondary" disabled={create.isPending} onClick={onBack}>
        Back to business details
      </Button>
    </form>
  );
}
