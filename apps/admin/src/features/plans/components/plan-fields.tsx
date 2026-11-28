'use client';
import { useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { planLimitNameSchema } from '@dakly/contracts/admin-plans';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';

import type { PlanFormValues } from './plan-form-schema';

type Props = { form: UseFormReturn<PlanFormValues>; id: string };

export function PlanFields({ form, id }: Props) {
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
      <LimitFields form={form} id={id} />
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

function LimitFields({ form, id }: Props) {
  const [newName, setNewName] = useState('');
  const limits = form.watch('limits');
  const nameError = newName !== '' && !planLimitNameSchema.safeParse(newName).success;
  const addLimit = () => {
    if (newName === '' || nameError || newName in limits) return;
    form.setValue('limits', { ...limits, [newName]: 0 });
    setNewName('');
  };
  const removeLimit = (name: string) => {
    form.setValue(
      'limits',
      Object.fromEntries(Object.entries(limits).filter(([key]) => key !== name)),
    );
  };
  return (
    <>
      {Object.keys(limits).map((name) => (
        <div key={name} className="space-y-1">
          <label htmlFor={`${id}-limit-${name}`}>Allowance: {name.replaceAll('_', ' ')}</label>
          <div className="flex gap-2">
            <Input
              id={`${id}-limit-${name}`}
              type="number"
              {...form.register(`limits.${name}`, { valueAsNumber: true })}
            />
            <Button type="button" onClick={() => removeLimit(name)}>
              Remove {name.replaceAll('_', ' ')}
            </Button>
          </div>
        </div>
      ))}
      <label htmlFor={`${id}-new-limit`}>New allowance name (lower case, underscores)</label>
      <div className="flex gap-2">
        <Input
          id={`${id}-new-limit`}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <Button type="button" onClick={addLimit}>
          Add allowance
        </Button>
      </div>
      {nameError ? (
        <p role="alert" className="text-danger">
          Use lower case letters, numbers and underscores, starting with a letter.
        </p>
      ) : null}
    </>
  );
}
