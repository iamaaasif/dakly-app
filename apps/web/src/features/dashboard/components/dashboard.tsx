'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import type { DashboardQuery, DashboardResponse } from '@dakly/contracts/dashboard';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useDashboard } from '../api/dashboard';
import { DashboardMetrics, LifecycleGroups } from './dashboard-metrics';
import { formatCalendarDate, localHour } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

const periods = [7, 30, 90] as const;

// The Ask box belongs to the assistant feature, so the page hands it in.
export function Dashboard({ period, askBox }: DashboardQuery & { askBox: ReactNode }) {
  const { data: session } = useSessionContext();
  const { data, error, isPending, refetch } = useDashboard(period, Boolean(session?.currentStore));
  if (!session?.currentStore) return null;

  const firstName = session.user.name.trim().split(/\s+/)[0];
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <DashboardHeader data={data} name={firstName} period={period} askBox={askBox} />
      {isPending && (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <span className="sr-only">Loading dashboard reports</span>
          {[0, 1, 2, 3].map((slot) => (
            <Skeleton key={slot} className="h-36 w-full" />
          ))}
        </div>
      )}
      {error && (
        <QueryError
          message={error.message}
          onRetry={() => refetch()}
          retryLabel="Retry dashboard"
        />
      )}
      {data && <DashboardResults data={data} period={period} />}
    </main>
  );
}

type HeaderProps = DashboardQuery & {
  data?: DashboardResponse;
  name?: string;
  askBox: ReactNode;
};

function DashboardHeader({ data, name, period, askBox }: HeaderProps) {
  return (
    <Card className="space-y-6 bg-linear-to-b from-primary-soft to-surface md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          {data && (
            <time dateTime={data.asOf} className="mb-2 block text-sm text-text-muted">
              {formatCalendarDate(data.asOf, data.timeZone)}
            </time>
          )}
          <h1 className={cn(data ? 'sr-only' : 'text-xl font-bold md:text-2xl')}>Dashboard</h1>
          {data && (
            <p className="text-xl font-bold md:text-2xl">
              {greeting(data)}, {name}
            </p>
          )}
        </div>
        {(!data || hasReports(data)) && (
          <nav
            aria-label="Reporting period"
            className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-border bg-surface p-1"
          >
            {periods.map((days) => (
              <Link
                key={days}
                href={`/dashboard?period=${days}`}
                aria-current={period === days ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-md px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                  period === days ? 'bg-primary-soft text-action-hover' : 'hover:bg-surface-muted',
                )}
              >
                {days} days
              </Link>
            ))}
          </nav>
        )}
      </div>
      {askBox}
    </Card>
  );
}

function hasReports(data: DashboardResponse) {
  return data.lifecycle !== undefined || Object.values(data.cards).some(Boolean);
}

function DashboardResults({ data, period }: { data: DashboardResponse; period: number }) {
  if (!hasReports(data))
    return <p className="text-text-muted">No reports are available with your access.</p>;
  return (
    <>
      <DashboardMetrics cards={data.cards} period={period} />
      {data.lifecycle && <LifecycleGroups counts={data.lifecycle} />}
    </>
  );
}

function greeting({ asOf, timeZone }: DashboardResponse) {
  const hour = localHour(asOf, timeZone);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
