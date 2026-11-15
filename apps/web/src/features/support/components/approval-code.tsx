'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { supportDecisionSchema, type SupportGrantResponse } from '@dakly/contracts/support';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import { type useOwnerDecision } from '../api/support';

export function ApprovalCode({
  grant,
  action,
}: {
  grant: SupportGrantResponse;
  action: ReturnType<typeof useOwnerDecision>;
}) {
  const form = useForm<{ code: string }>({ resolver: zodResolver(supportDecisionSchema) });
  return (
    <form
      method="post"
      className="space-y-3"
      onSubmit={form.handleSubmit((input) =>
        action.mutate({ id: grant.id, action: 'approve', code: input.code }),
      )}
    >
      <label htmlFor={`code-${grant.id}`}>SMS approval code</label>
      <Input
        id={`code-${grant.id}`}
        autoComplete="one-time-code"
        inputMode="numeric"
        {...form.register('code')}
      />
      {form.formState.errors.code ? <p role="alert">Enter the six-digit code.</p> : null}
      <Button type="submit" loading={action.isPending}>
        Approve access
      </Button>
    </form>
  );
}
