'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { staffAuditExportSchema, type StaffAuditSearch } from '@dakly/contracts/staff-audit';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useAuditExport, useExportStatus } from '../api/audit';

export function AuditExport({ filter }: { filter: StaffAuditSearch }) {
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
