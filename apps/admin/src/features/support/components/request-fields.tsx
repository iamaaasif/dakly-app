import { type useForm } from 'react-hook-form';

import { type SupportRequestInput } from '@dakly/contracts/support';
import { Input } from '@dakly/ui/input';

export function RequestFields({ form }: { form: ReturnType<typeof useForm<SupportRequestInput>> }) {
  return (
    <>
      <label htmlFor="reason">Reason (at least 10 characters)</label>
      <Input id="reason" {...form.register('reason')} />
      <label htmlFor="access">Access</label>
      <select
        id="access"
        className="min-h-10 w-full rounded-md border border-input-border bg-surface p-2"
        {...form.register('access')}
      >
        <option value="read">Read only</option>
        <option value="write">Read and write</option>
      </select>
      <label htmlFor="duration">Duration in minutes (30–1440)</label>
      <Input
        id="duration"
        type="number"
        min={30}
        max={1440}
        {...form.register('durationMinutes', { valueAsNumber: true })}
      />
      <label className="flex gap-2">
        <input type="checkbox" checked disabled />
        Customers: read by ID and create
      </label>
    </>
  );
}
