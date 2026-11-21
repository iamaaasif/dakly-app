'use client';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';

import type { PlanFormValues } from './plan-form-schema';

type Props = { form: UseFormReturn<PlanFormValues>; id: string; limitNames: string[] };

export function PlanFields({ form, id, limitNames }: Props) {
  return (
    <>
      <label htmlFor={`${id}-name`}>Name</label>
      <Input id={`${id}-name`} {...form.register('name')} />
      <label htmlFor={`${id}-monthly`}>Monthly price (taka)</label>
      <Input
        id={`${id}-monthly`}
        type="number"
        step="0.01"
        {...form.register('monthlyPricePoisha', { valueAsNumber: true })}
      />
      <label htmlFor={`${id}-yearly`}>Yearly price (taka)</label>
      <Input
        id={`${id}-yearly`}
        type="number"
        step="0.01"
        {...form.register('yearlyPricePoisha', { valueAsNumber: true })}
      />
      <label htmlFor={`${id}-trial`}>Trial (days, 0 to 90)</label>
      <Input
        id={`${id}-trial`}
        type="number"
        {...form.register('trialDays', { valueAsNumber: true })}
      />
      <LimitFields form={form} id={id} limitNames={limitNames} />
      <Controller
        control={form.control}
        name="isPublic"
        render={({ field }) => (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            <span>Show on the public plans page</span>
          </label>
        )}
      />
      <label htmlFor={`${id}-reason`}>Reason (at least 10 characters)</label>
      <Input id={`${id}-reason`} {...form.register('reason')} />
      <Controller
        control={form.control}
        name="confirmed"
        render={({ field }) => (
          <label className="flex items-start gap-2">
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true ? true : undefined)}
            />
            <span>New sign-ups and renewals use these values. Shops mid-period keep theirs.</span>
          </label>
        )}
      />
    </>
  );
}

function LimitFields({ form, id, limitNames }: Props) {
  return (
    <>
      {limitNames.map((name) => (
        <div key={name} className="space-y-1">
          <label htmlFor={`${id}-limit-${name}`}>Allowance: {name.replaceAll('_', ' ')}</label>
          <Input
            id={`${id}-limit-${name}`}
            type="number"
            {...form.register(`limits.${name}`, { valueAsNumber: true })}
          />
        </div>
      ))}
    </>
  );
}
