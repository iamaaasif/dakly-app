'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import {
  settlementLineActionSchema,
  type SettlementLineActionInput,
} from '@dakly/contracts/admin-reconciliation';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';

import { useCloseLine } from '../api/reconciliation';

export function LineForm({ lineId }: { lineId: string }) {
  const close = useCloseLine(lineId);
  const form = useForm<SettlementLineActionInput>({
    resolver: zodResolver(settlementLineActionSchema),
    defaultValues: { reason: '' },
  });
  const submit = (action: SettlementLineActionInput['action']) =>
    form.handleSubmit((values) => close.mutate({ ...values, action }));
  return (
    <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor={`${lineId}-reason`}>Reason (at least 10 characters)</label>
      <Input id={`${lineId}-reason`} {...form.register('reason')} />
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
              Gateway errors leave the queue. Escalated lines stay until finance matches them.
            </span>
          </label>
        )}
      />
      {form.formState.errors.reason || form.formState.errors.confirmed ? (
        <p role="alert" className="text-danger">
          Give a reason of at least 10 characters and confirm.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" loading={close.isPending} onClick={submit('gateway_error')}>
          Mark gateway error
        </Button>
        <Button type="button" loading={close.isPending} onClick={submit('escalated')}>
          Escalate
        </Button>
      </div>
      {close.error ? (
        <p role="alert" className="text-danger">
          {close.error.message}
        </p>
      ) : null}
    </form>
  );
}
