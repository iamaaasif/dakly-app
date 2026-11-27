'use client';

import type { ReactNode } from 'react';

import type { DashboardQuery, DashboardResponse } from '@dakly/contracts/dashboard';
import { QueryError } from '@dakly/ui/query-error';

import { useDashboard } from '../api/dashboard';
import { DashboardActions, type DashboardSupportLink } from './dashboard-actions';
import { DashboardOverview, type DashboardActivity } from './dashboard-overview';
import { formatCalendarDate, localHour } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

export function Dashboard({
  period,
  setupCard,
  activity,
  support,
}: DashboardQuery & {
  setupCard: ReactNode;
  activity: DashboardActivity;
  support: DashboardSupportLink;
}) {
  const { data: session } = useSessionContext();
  const store = session?.currentStore;
  const report = useDashboard(period, Boolean(store));
  const { data } = report;
  if (!store) return null;

  const firstName = session.user.name.trim().split(/\s+/)[0];
  const reportPeriod = data?.period ?? period;
  return (
    <main className="px-3.5 py-5 sm:px-6 sm:py-6">
      <div className="@container/dashboard mx-auto max-w-300 space-y-5">
        <DashboardGreeting data={data} name={firstName} />
        {report.error && (
          <QueryError
            message={report.error.message}
            onRetry={() => report.refetch()}
            retryLabel="Retry dashboard"
          />
        )}
        <DashboardOverview data={data} period={reportPeriod} activity={activity} store={store} />
        {setupCard}
        <DashboardActions
          activity={activity}
          store={store}
          stoppedBuying={data?.lifecycle?.stopped_buying}
          support={support}
        />
      </div>
    </main>
  );
}

function DashboardGreeting({ data, name }: { data?: DashboardResponse; name?: string }) {
  return (
    <header className="space-y-1.5">
      <h1 className={data ? 'sr-only' : 'text-title font-bold tracking-tight'}>Dashboard</h1>
      {data && (
        <>
          <time dateTime={data.asOf} className="block text-sm font-semibold text-text-muted">
            {formatCalendarDate(data.asOf, data.timeZone)}
          </time>
          <h2 className="text-xl leading-tight font-bold tracking-tight sm:text-title">
            {name ? `${greeting(data)}, ${name}` : greeting(data)}
          </h2>
        </>
      )}
    </header>
  );
}

function greeting({ asOf, timeZone }: DashboardResponse) {
  const hour = localHour(asOf, timeZone);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
