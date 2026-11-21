'use client';
import { Skeleton } from '@dakly/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { useProviderHealth } from '../api/operations';
import { formatDate } from '@/lib/format-date';

function errorRate(failures: number, attempts: number): string {
  return attempts === 0 ? 'No traffic' : `${((failures / attempts) * 100).toFixed(1)}%`;
}

export function ProviderHealthPanel() {
  const health = useProviderHealth();
  if (health.isPending) return <Skeleton className="h-40 w-full" />;
  if (health.error) return <p role="alert">{health.error.message}</p>;
  return (
    <section className="space-y-3" aria-labelledby="health-heading">
      <h2 id="health-heading" className="text-lg font-semibold">
        Provider health
      </h2>
      <p className="text-muted">Updated {formatDate(health.data.generatedAt)}</p>
      {health.data.providers.length === 0 ? <p>No provider traffic in the last day.</p> : null}
      {health.data.providers.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Errors, last hour</TableHead>
              <TableHead>Errors, last day</TableHead>
              <TableHead>Latency, last hour</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {health.data.providers.map((row) => (
              <TableRow key={row.provider}>
                <TableCell className="break-all">{row.provider}</TableCell>
                <TableCell>
                  {errorRate(row.hourFailures, row.hourAttempts)} ({row.hourFailures} of{' '}
                  {row.hourAttempts})
                </TableCell>
                <TableCell>
                  {errorRate(row.dayFailures, row.dayAttempts)} ({row.dayFailures} of{' '}
                  {row.dayAttempts})
                </TableCell>
                <TableCell>
                  {row.averageLatencyMsLastHour === null
                    ? 'Not recorded'
                    : `${row.averageLatencyMsLastHour} ms`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}
