'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { createPlanSchema } from '@dakly/contracts/admin-plans';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { useCreatePlan } from '../api/plans';
import { PlanFields } from './plan-fields';
import { POISHA_PER_TAKA, planFormSchema, type PlanFormValues } from './plan-form-schema';

export function NewPlanForm({ onDone }: { onDone: () => void }) {
  const create = useCreatePlan();
  const [code, setCode] = useState('');
  const codeValid = createPlanSchema.shape.code.safeParse(code).success;
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: '',
      trialDays: 0,
      monthlyPricePoisha: 0,
      yearlyPricePoisha: 0,
      limits: {},
      isPublic: false,
      reason: '',
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(
        (values: PlanFormValues) =>
          codeValid &&
          create.mutate(
            {
              ...values,
              code,
              monthlyPricePoisha: Math.round(values.monthlyPricePoisha * POISHA_PER_TAKA),
              yearlyPricePoisha: Math.round(values.yearlyPricePoisha * POISHA_PER_TAKA),
            },
            { onSuccess: onDone },
          ),
      )}
    >
      <label htmlFor="new-plan-code">Code (lower case, cannot change later)</label>
      <Input id="new-plan-code" value={code} onChange={(event) => setCode(event.target.value)} />
      <PlanFields form={form} id="new-plan" />
      {Object.keys(form.formState.errors).length > 0 ||
      (form.formState.isSubmitted && !codeValid) ? (
        <p role="alert" className="text-danger">
          Check the highlighted fields: the code needs lower case letters, every number needs a
          value and the reason needs 10 characters.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" loading={create.isPending}>
          Create plan
        </Button>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {create.error ? (
        <p role="alert" className="text-danger">
          {create.error.message}
        </p>
      ) : null}
    </form>
  );
}
