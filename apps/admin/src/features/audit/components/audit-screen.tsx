'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { staffAuditExportSchema, type StaffAuditSearch } from '@dakly/contracts/staff-audit';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useAudit, useAuditExport, useExportStatus } from '../api/audit';

export function AuditScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const list = useAudit(params.toString());
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Staff audit history</h1>
      <AuditFilters />
      <AuditExport filter={searchFilter(params)} />
      {list.isPending ? <p role="status">Loading audit history…</p> : null}
      {list.error ? <p role="alert">{list.error.message}</p> : null}
      {list.data?.rows.length === 0 ? <p>No matching audit entries.</p> : null}
      {list.data?.rows.map((row) => (
        <Card key={row.id}>
          <p className="font-semibold">{row.action}</p>
          <p>{row.createdAt}</p>
          <p>Actor: {row.staffUserId ?? row.actorUserId ?? row.operatorIdentity}</p>
          <p>Shop: {row.storeId ?? 'No shop'}</p>
          <p>{row.reason}</p>
          <pre className="overflow-auto text-sm break-all whitespace-pre-wrap">
            {JSON.stringify(row.actionDetails)}
          </pre>
        </Card>
      ))}
      {list.data?.cursor ? (
        <Button
          onClick={() => {
            const query = new URLSearchParams(params);
            query.set('cursor', list.data!.cursor!);
            router.push(`/audit?${query}`);
          }}
        >
          Next page
        </Button>
      ) : null}
    </main>
  );
}
function AuditFilters() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <Card>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const query = new URLSearchParams();
          for (const [key, value] of data) if (value) query.set(key, String(value));
          router.push(`/audit?${query}`);
        }}
      >
        {['action', 'staffUserId', 'storeId', 'from', 'to'].map((key) => (
          <label key={key}>
            {key}
            <Input
              name={key}
              defaultValue={params.get(key) ?? ''}
              placeholder={key === 'from' || key === 'to' ? '2026-11-14T00:00:00Z' : undefined}
            />
          </label>
        ))}
        <Button type="submit">Search history</Button>
        <Link href="/audit" className="text-action underline">
          Clear filters
        </Link>
      </form>
    </Card>
  );
}
function AuditExport({ filter }: { filter: StaffAuditSearch }) {
  const create = useAuditExport();
  const status = useExportStatus(create.data?.id);
  const form = useForm<{ filter: StaffAuditSearch; reason: string }>({
    resolver: zodResolver(staffAuditExportSchema),
    values: { filter, reason: '' },
  });
  return (
    <Card>
      <h2 className="text-lg font-semibold">Export matching entries</h2>
      <p>
        Maximum 1,000 entries. Larger results require narrower filters. The CSV shows your staff
        name and expires after 24 hours.
      </p>
      <form className="space-y-3" onSubmit={form.handleSubmit((input) => create.mutate(input))}>
        <label htmlFor="export-reason">Reason for export</label>
        <Input id="export-reason" {...form.register('reason')} />
        {form.formState.errors.reason ? <p role="alert">Enter at least 10 characters.</p> : null}
        <Button type="submit" loading={create.isPending}>
          Request export
        </Button>
      </form>
      {create.error ? <p role="alert">{create.error.message}</p> : null}
      {status.error ? <p role="alert">{status.error.message}</p> : null}
      {status.data ? (
        <p role="status">
          {status.data.status} · {status.data.progress}% · Expires {status.data.expiresAt}
        </p>
      ) : null}
      {status.data?.error ? <p role="alert">{status.data.error}</p> : null}
      {status.data?.status === 'ready' ? (
        <a
          href={`/api/admin/audit/exports/${status.data.id}/download`}
          className="text-action underline"
        >
          Download CSV
        </a>
      ) : null}
    </Card>
  );
}

function searchFilter(params: URLSearchParams): StaffAuditSearch {
  return Object.fromEntries(
    ['action', 'staffUserId', 'storeId', 'from', 'to'].flatMap((key) =>
      params.get(key) ? [[key, params.get(key)!]] : [],
    ),
  );
}
