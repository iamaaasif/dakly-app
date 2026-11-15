'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { breakGlassRequestSchema, type BreakGlassRequest } from '@dakly/contracts/break-glass';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useBreakGlassPreview } from '../api/break-glass';
import { ConfirmBreakGlass } from './confirm-break-glass';

export function BreakGlassForm({ target }: { target?: { id: string; name: string } }) {
  const preview = useBreakGlassPreview();
  const form = useForm<BreakGlassRequest>({
    resolver: zodResolver(breakGlassRequestSchema),
    defaultValues: { targetId: target?.id ?? '', reason: '', category: 'security_incident' },
  });
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Break-glass access</h2>
      <p>
        Super admins may open read-only customer access for a security incident or legal request.
        The Owner can end it. Other Super admins are alerted.
      </p>
      <form className="space-y-3" onSubmit={form.handleSubmit((input) => preview.mutate(input))}>
        <p>Selected shop: {target?.name ?? 'Choose a shop above'}</p>
        <label htmlFor="break-glass-category">Purpose</label>
        <select
          id="break-glass-category"
          className="min-h-10 w-full rounded-md border border-input-border bg-surface p-2"
          {...form.register('category')}
        >
          <option value="security_incident">Security incident</option>
          <option value="legal_request">Legal request</option>
        </select>
        <label htmlFor="break-glass-reason">Reason (10–1000 characters)</label>
        <Input id="break-glass-reason" {...form.register('reason')} />
        {Object.entries(form.formState.errors).map(([key, error]) => (
          <p role="alert" key={key}>
            {error.message}
          </p>
        ))}
        <Button type="submit" variant="danger" loading={preview.isPending} disabled={!target}>
          Review break-glass access
        </Button>
        {preview.error ? <p role="alert">{preview.error.message}</p> : null}
      </form>
      {preview.data ? (
        <ConfirmBreakGlass
          key={preview.data.effect.id}
          preview={preview.data}
          onClose={() => preview.reset()}
        />
      ) : null}
    </Card>
  );
}
