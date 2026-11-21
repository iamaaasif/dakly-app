'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { AdminPlan } from '@dakly/contracts/admin-plans';
import { Button } from '@dakly/ui/button';

import { useUpdatePlan } from '../api/plans';
import { PlanFields } from './plan-fields';
import { POISHA_PER_TAKA, planFormSchema, type PlanFormValues } from './plan-form-schema';

export function PlanForm({ plan, onDone }: { plan: AdminPlan; onDone: () => void }) {
  const update = useUpdatePlan(plan.code);
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: plan.name,
      trialDays: plan.trialDays,
      monthlyPricePoisha: plan.monthlyPricePoisha / POISHA_PER_TAKA,
      yearlyPricePoisha: plan.yearlyPricePoisha / POISHA_PER_TAKA,
      limits: plan.limits,
      isPublic: plan.isPublic,
      reason: '',
    },
  });
  const id = `plan-${plan.code}`;
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit((values: PlanFormValues) =>
        update.mutate(
          {
            ...values,
            monthlyPricePoisha: Math.round(values.monthlyPricePoisha * POISHA_PER_TAKA),
            yearlyPricePoisha: Math.round(values.yearlyPricePoisha * POISHA_PER_TAKA),
          },
          { onSuccess: onDone },
        ),
      )}
    >
      <PlanFields form={form} id={id} limitNames={Object.keys(plan.limits)} />
      {Object.keys(form.formState.errors).length > 0 ? (
        <p role="alert" className="text-danger">
          Check the highlighted fields: every number needs a value and the reason needs 10
          characters.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" loading={update.isPending}>
          Save plan
        </Button>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {update.error ? (
        <p role="alert" className="text-danger">
          {update.error.message}
        </p>
      ) : null}
    </form>
  );
}
