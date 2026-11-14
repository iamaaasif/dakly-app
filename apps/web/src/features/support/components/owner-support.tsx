'use client';
import { formatDateTime } from '@/lib/format-date';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supportDecisionSchema, type SupportGrantResponse } from '@dakly/contracts/support';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Card } from '@dakly/ui/card';
import { useOwnerSupport, useOwnerDecision } from '../api/support';
export function OwnerSupport() {
  const params = useSearchParams();
  const router = useRouter();
  const list = useOwnerSupport(params.get('before') ?? '');
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-xl font-semibold">Support access</h1>
      <p>
        Only the current Owner can approve, deny or end support access. Approval requires the code
        sent to your verified phone.
      </p>
      <Button onClick={() => list.refetch()}>Refresh requests</Button>
      {list.isPending ? <p role="status">Loading requests…</p> : null}
      {list.error ? <p role="alert">{list.error.message}</p> : null}
      {list.data?.items.length === 0 ? <p>No support requests.</p> : null}
      {list.data?.nextCursor ? (
        <Button onClick={() => router.push(`/support-access?before=${list.data!.nextCursor!}`)}>
          Next page
        </Button>
      ) : null}
      {list.data?.items.map((grant) => (
        <OwnerRequest key={grant.id} grant={grant} />
      ))}
    </main>
  );
}
function OwnerRequest({ grant }: { grant: SupportGrantResponse }) {
  const action = useOwnerDecision();
  return (
    <Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{grant.staffName}</h2>
        <p>{grant.reason}</p>
        {grant.isBreakGlass ? (
          <p className="text-danger">
            Break-glass read-only access. No Owner approval was requested.
          </p>
        ) : null}
        <p>
          {grant.access === 'write' ? 'Read and write' : 'Read only'} · {grant.scopes.join(', ')} ·{' '}
          {grant.durationMinutes} minutes
        </p>
        <p>{grant.status === 'approved' ? 'Active support access' : `Status: ${grant.status}`}</p>
        {grant.expiresAt ? <p>Ends {formatDateTime(grant.expiresAt)}</p> : null}
        {grant.status === 'requested' ? (
          <>
            <Button
              loading={action.isPending}
              onClick={() => action.mutate({ id: grant.id, action: 'code' })}
            >
              Resend approval code
            </Button>
            <ApprovalCode grant={grant} action={action} />
            <Button
              variant="secondary"
              loading={action.isPending}
              onClick={() => action.mutate({ id: grant.id, action: 'deny' })}
            >
              Deny request
            </Button>
          </>
        ) : null}
        {grant.status === 'approved' ? (
          <Button
            variant="danger"
            loading={action.isPending}
            onClick={() => action.mutate({ id: grant.id, action: 'end' })}
          >
            End now
          </Button>
        ) : null}
        {action.error ? <p role="alert">{action.error.message}</p> : null}
        {action.isSuccess ? <p role="status">{confirmation[action.variables!.action]}</p> : null}
      </div>
    </Card>
  );
}

function ApprovalCode({
  grant,
  action,
}: {
  grant: SupportGrantResponse;
  action: ReturnType<typeof useOwnerDecision>;
}) {
  const form = useForm<{ code: string }>({ resolver: zodResolver(supportDecisionSchema) });
  return (
    <form
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

const confirmation = {
  code: 'Approval code sent to your verified phone.',
  approve: 'Support access approved.',
  deny: 'Support request denied.',
  end: 'Support access ended.',
} as const;
