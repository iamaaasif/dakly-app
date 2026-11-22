'use client';

import { useState } from 'react';

import { analyticsViewSchema, type AnalyticsView } from '@dakly/contracts/analytics';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { periodChoices } from '../analytics-labels';
import { useAttributionSettings } from '../api/analytics-attribution';
import { analyticsHref, useAnalyticsOverview } from '../api/analytics-overview';
import { AnalyticsDownloadButton } from './analytics-download-button';
import { AnalyticsReport } from './analytics-report';
import { HowDaklyCountsOrders } from './how-dakly-counts-orders';
import { UrlLink } from '@/components/url-link';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

export function AnalyticsScreen(initial: { view: AnalyticsView }) {
  const { view } = useUrlQuery(initial, (raw) => {
    const parsed = analyticsViewSchema.safeParse(raw);
    return parsed.success ? { view: parsed.data } : undefined;
  });
  const overview = useAnalyticsOverview(view.period);
  const attribution = useAttributionSettings();
  const { data: session } = useSessionContext();
  const [isCountingOpen, setIsCountingOpen] = useState(false);
  const isRebuilding = attribution.data?.rebuilding === true;
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
        <AnalyticsReport
          data={overview.data}
          view={view}
          attribution={attribution.data}
          onOpenCounting={() => setIsCountingOpen(true)}
        />
      )}
      {attribution.data && (
        <HowDaklyCountsOrders
          open={isCountingOpen}
          onClose={() => setIsCountingOpen(false)}
          windowDays={attribution.data.windowDays}
          canChange={session?.currentStore?.canChangeAttributionWindow === true}
          isRebuilding={isRebuilding}
        />
      )}
    </main>
  );
}

function AnalyticsHeader({ view }: { view: AnalyticsView }) {
  const router = useUrlRouter();
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="lg:max-w-sm">
        <h1 className="text-xl font-bold md:text-2xl">Analytics</h1>
        <p className="mt-1 text-text-muted">
          How much your marketing earned, and which messages and posts worked best.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 lg:shrink-0 lg:flex-nowrap">
        <label className="flex min-h-10 items-center gap-2 font-medium whitespace-nowrap">
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
          className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-surface-muted p-1 lg:flex-nowrap"
        >
          {periodChoices.map(({ days, label }) => (
            <UrlLink
              key={days}
              href={analyticsHref({ ...view, period: days })}
              aria-current={view.period === days ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                view.period === days ? 'shadow-sm bg-surface' : 'text-text-muted hover:text-text',
              )}
            >
              {label}
            </UrlLink>
          ))}
        </nav>
        <AnalyticsDownloadButton view={view} />
      </div>
    </header>
  );
}
