'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  staffRecoveryLookupSchema,
  type StaffRecoveryLookup,
  type StaffRecoveryTarget,
} from '@dakly/contracts/staff-recovery';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { useRecoveryLookup } from '../api/recovery';
export function RecoveryLookup({
  onSelect,
}: {
  onSelect: (target: StaffRecoveryTarget | undefined) => void;
}) {
  const lookup = useRecoveryLookup();
  const form = useForm<StaffRecoveryLookup>({
    resolver: zodResolver(staffRecoveryLookupSchema),
    defaultValues: { identifier: '' },
  });
  return (
    <form
      method="post"
      className="space-y-3"
      onSubmit={form.handleSubmit((input) => {
        onSelect(undefined);
        lookup.mutate(input, { onSuccess: onSelect });
      })}
    >
      <label htmlFor="old-contact">Exact old verified phone or email</label>
      <Input id="old-contact" {...form.register('identifier')} />
      {form.formState.errors.identifier ? (
        <p role="alert">Enter the complete phone number or email address.</p>
      ) : null}
      {lookup.error ? <p role="alert">{lookup.error.message}</p> : null}
      <Button type="submit" loading={lookup.isPending}>
        Find account
      </Button>
    </form>
  );
}
