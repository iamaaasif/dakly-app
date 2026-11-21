'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import {
  changeKillSwitchSchema,
  type ChangeKillSwitchInput,
  type KillSwitchFeature,
} from '@dakly/contracts/kill-switches';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { Input } from '@dakly/ui/input';

import { useChangeKillSwitch } from '../api/operations';

type Props = {
  feature: KillSwitchFeature;
  storeId: string | null;
  paused: boolean;
  label: string;
};

export function KillSwitchForm({ feature, storeId, paused, label }: Props) {
  const change = useChangeKillSwitch();
  const form = useForm<ChangeKillSwitchInput>({
    resolver: zodResolver(changeKillSwitchSchema),
    defaultValues: { paused, reason: '' },
  });
  const id = `${feature}-${storeId ?? 'all'}`;
  const effect = paused
    ? 'Queued work starts again within a minute.'
    : 'Queued work waits and nothing is dropped. This takes effect within a minute.';
  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit((input) =>
        change.mutate(
          { feature, storeId, change: input },
          { onSuccess: () => form.reset({ paused: !paused, reason: '' }) },
        ),
      )}
    >
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
            <span>{effect}</span>
          </label>
        )}
      />
      {Object.entries(form.formState.errors).map(([key, error]) => (
        <p role="alert" className="text-danger" key={key}>
          {error.message}
        </p>
      ))}
      <Button type="submit" loading={change.isPending}>
        {label}
      </Button>
      {change.error ? (
        <p role="alert" className="text-danger">
          {change.error.message}
        </p>
      ) : null}
    </form>
  );
}
