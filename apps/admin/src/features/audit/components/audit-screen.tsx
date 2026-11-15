'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

import { type StaffAuditSearch } from '@dakly/contracts/staff-audit';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useAudit } from '../api/audit';
import { AuditExport } from './audit-export';
import { AuditFilters } from './audit-filters';

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

function searchFilter(params: URLSearchParams): StaffAuditSearch {
  return Object.fromEntries(
    ['action', 'staffUserId', 'storeId', 'from', 'to'].flatMap((key) =>
      params.get(key) ? [[key, params.get(key)!]] : [],
    ),
  );
}
