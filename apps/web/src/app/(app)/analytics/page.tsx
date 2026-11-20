import Link from 'next/link';

import { analyticsViewSchema } from '@dakly/contracts/analytics';

import { StorePage } from '@/components/store-page';
import { AnalyticsScreen } from '@/features/analytics/components/analytics-screen';
import { requireSession } from '@/lib/require-session';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const view = analyticsViewSchema.safeParse(await searchParams);
  return (
    <StorePage permission="canViewAnalytics">
      {view.success ? (
        <AnalyticsScreen view={view.data} />
      ) : (
        <p role="alert" className="p-6">
          The analytics filters are invalid.{' '}
          <Link
            href="/analytics"
            className="inline-flex min-h-10 min-w-10 items-center text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Open Analytics
          </Link>
          .
        </p>
      )}
    </StorePage>
  );
}
