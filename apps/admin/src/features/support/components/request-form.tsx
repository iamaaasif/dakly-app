'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { supportRequestSchema, type SupportRequestInput } from '@dakly/contracts/support';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useRequestSupport } from '../api/support';
import { RequestFields } from './request-fields';

export function RequestForm({ target }: { target?: { id: string; name: string } }) {
  const create = useRequestSupport();
  const form = useForm<SupportRequestInput>({
    resolver: zodResolver(supportRequestSchema),
    values: {
      targetId: target?.id ?? '',
      scopes: ['customers'],
      access: 'read',
      durationMinutes: 30,
      reason: '',
    },
  });
  return (
    <Card>
      <h2 className="text-lg font-semibold">Request access</h2>
      <form className="space-y-4" onSubmit={form.handleSubmit((input) => create.mutate(input))}>
        <p>Selected shop: {target?.name ?? 'Choose a shop above'}</p>
        <RequestFields form={form} />
        {Object.entries(form.formState.errors).map(([key, error]) => (
          <p role="alert" key={key}>
            {error.message}
          </p>
        ))}
        <Button type="submit" loading={create.isPending}>
          Send request
        </Button>
        {create.error ? <p role="alert">{create.error.message}</p> : null}
        {create.isSuccess ? (
          <p role="status">
            {create.data?.codeSent
              ? 'Request sent. The Owner received an approval code.'
              : 'Request saved, but the code could not be sent. The Owner can resend it under Support access.'}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
