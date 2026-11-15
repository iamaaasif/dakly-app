'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import type { SupportGrantResponse, SupportRequestInput } from '@dakly/contracts/support';
import { supportRequestSchema } from '@dakly/contracts/support';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import {
  useSupportRequests,
  useSupportTargets,
  useRequestSupport,
  useOpenSupport,
} from '../api/support';
import { BreakGlassForm } from './break-glass-form';

export function SupportScreen({ canBreakGlass }: { canBreakGlass: boolean }) {
  const [target, setTarget] = useState<{ id: string; name: string }>();
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Support access</h1>
      <p>
        Ask the Owner for time-limited access. Supported now: read a customer by ID and create
        customers. Account, team, ownership and billing controls are unavailable.
      </p>
      <TargetSearch onSelect={setTarget} />
      <RequestForm target={target} />
      {canBreakGlass ? <BreakGlassForm key={target?.id} target={target} /> : null}
      <RequestList />
    </main>
  );
}
function TargetSearch({ onSelect }: { onSelect: (target: { id: string; name: string }) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get('query') ?? '');
  const targets = useSupportTargets(params.get('query') ?? '');
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          router.replace(`/support?query=${encodeURIComponent(query)}`);
        }}
      >
        <label htmlFor="target">Shop ID or exact shop slug</label>
        <Input
          id="target"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          required
          minLength={3}
        />
        <Button type="submit">Find shop</Button>
      </form>
      {targets.isFetching ? <p role="status">Finding shop…</p> : null}
      {targets.error ? <p role="alert">{targets.error.message}</p> : null}
      {targets.data?.length === 0 ? <p>No shop found.</p> : null}
      {targets.data?.map((target) => (
        <Button key={target.id} variant="secondary" onClick={() => onSelect(target)}>
          {target.name}
        </Button>
      ))}
    </Card>
  );
}
function RequestForm({ target }: { target?: { id: string; name: string } }) {
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
function RequestFields({ form }: { form: ReturnType<typeof useForm<SupportRequestInput>> }) {
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
function RequestList() {
  const params = useSearchParams();
  const router = useRouter();
  const requests = useSupportRequests(params.get('before') ?? '');
  return (
    <>
      <h2 className="text-lg font-semibold">Your recent requests</h2>
      <Button variant="secondary" onClick={() => requests.refetch()}>
        Refresh requests
      </Button>
      {requests.isPending ? <p role="status">Loading requests…</p> : null}
      {requests.error ? <p role="alert">{requests.error.message}</p> : null}
      {requests.data?.items.length === 0 ? <p>No support requests yet.</p> : null}
      {requests.data?.nextCursor ? (
        <Button
          onClick={() => {
            const query = new URLSearchParams(params);
            query.set('before', requests.data!.nextCursor!);
            router.push(`/support?${query}`);
          }}
        >
          Next page
        </Button>
      ) : null}
      {requests.data?.items.map((grant) => (
        <RequestCard key={grant.id} grant={grant} />
      ))}
    </>
  );
}
function RequestCard({ grant }: { grant: SupportGrantResponse }) {
  const open = useOpenSupport();
  return (
    <Card>
      <p className="font-semibold">{grant.reason}</p>
      {grant.isBreakGlass ? (
        <p className="text-danger">Break-glass access · no Owner approval</p>
      ) : null}
      <p>
        {grant.status} · {grant.access === 'write' ? 'Read and write' : 'Read only'} ·{' '}
        {grant.durationMinutes} minutes
      </p>
      <p>Scope: {grant.scopes.join(', ')}</p>
      {grant.status === 'approved' ? (
        <Button loading={open.isPending} onClick={() => open.mutate(grant.id)}>
          Open support session
        </Button>
      ) : null}
      {open.error ? <p role="alert">{open.error.message}</p> : null}
    </Card>
  );
}
