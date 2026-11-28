'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';

import { useRetirePlan } from '../api/plans';
import { retireFormSchema, type RetireFormValues } from './plan-form-schema';

export function RetirePlanForm({ code, onDone }: { code: string; onDone: () => void }) {
  const retire = useRetirePlan(code);
  const form = useForm<RetireFormValues>({
    resolver: zodResolver(retireFormSchema),
    defaultValues: { reason: '' },
  });
  return (
    <form className="space-y-3" onSubmit={form.handleSubmit((values) => retire.mutate(values))}>
      <label htmlFor={`retire-${code}-reason`}>Reason (at least 10 characters)</label>
      <Input id={`retire-${code}-reason`} {...form.register('reason')} />
      <Controller
        control={form.control}
        name="confirmed"
        render={({ field }) => (
          <label className="flex items-start gap-2">
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true ? true : undefined)}
            />
            <span>
              Nobody can pick this plan again. Shops already on it keep it. This cannot be undone.
            </span>
          </label>
        )}
      />
      <div className="flex gap-2">
        <Button type="submit" loading={retire.isPending}>
          Retire plan
        </Button>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {retire.error ? (
        <p role="alert" className="text-danger">
          {retire.error.message}
        </p>
      ) : null}
    </form>
  );
}
