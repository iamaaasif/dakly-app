'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { AnalyticsView } from '@dakly/contracts/analytics';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { periodChoices } from '../analytics-labels';
import { analyticsHref, useAnalyticsOverview } from '../api/analytics-overview';
import { AnalyticsHeadline } from './analytics-headline';
import { AnalyticsKeyFigures } from './analytics-key-figures';
import { AnalyticsOverviewTab } from './analytics-overview-tab';
import { AnalyticsTabs } from './analytics-tabs';

export function AnalyticsScreen({ view }: { view: AnalyticsView }) {
  const overview = useAnalyticsOverview(view.period);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <AnalyticsHeader view={view} />
      {overview.isPending && (
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading analytics</span>
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}
      {overview.error && (
        <QueryError
          message={overview.error.message}
          onRetry={() => overview.refetch()}
          retryLabel="Retry analytics"
        />
      )}
      {overview.data && (
        <>
          <AnalyticsHeadline data={overview.data} view={view} />
          <AnalyticsKeyFigures data={overview.data} view={view} />
          <AnalyticsTabs view={view} />
          <AnalyticsOverviewTab data={overview.data} view={view} />
        </>
      )}
    </main>
  );
}

function AnalyticsHeader({ view }: { view: AnalyticsView }) {
  const router = useRouter();
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Analytics</h1>
        <p className="mt-1 text-text-muted">
          How much your marketing earned, and which messages and posts worked best.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex min-h-10 items-center gap-2 font-medium">
          <Checkbox
            checked={view.compare}
            onCheckedChange={(checked) =>
              router.replace(analyticsHref({ ...view, compare: checked === true }))
            }
          />
          Compare with before
        </label>
        <nav
          aria-label="Reporting period"
          className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-surface-muted p-1"
        >
          {periodChoices.map(({ days, label }) => (
            <Link
              key={days}
              href={analyticsHref({ ...view, period: days })}
              aria-current={view.period === days ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                view.period === days ? 'shadow-sm bg-surface' : 'text-text-muted hover:text-text',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
