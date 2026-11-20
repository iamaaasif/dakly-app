import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import type { AnalyticsSocialPostRow, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useAnalyticsSocialPosts } from '../api/analytics-overview';
import { formatShortDate } from '@/lib/format-date';

const networkLabels = { facebook: 'Facebook', instagram: 'Instagram' } as const;

export function AnalyticsSocialTab({ view, timeZone }: { view: AnalyticsView; timeZone: string }) {
  const query = useAnalyticsSocialPosts(view.period);
  if (query.isPending)
    return <Skeleton role="status" aria-label="Loading social posts" className="h-64 w-full" />;
  if (query.error)
    return (
      <QueryError
        message={query.error.message}
        onRetry={() => query.refetch()}
        retryLabel="Retry social posts"
      />
    );
  const { posts, totals } = query.data;
  const mostReach = Math.max(1, ...posts.map((post) => post.reach ?? 0));
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Social posts</h2>
          <p className="text-text-muted">Ranked by how many people saw them.</p>
        </div>
        <Link
          href="/social"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 font-medium text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          See all posts
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
      </div>
      <p className="text-sm text-text-muted">
        {formatCount(totals.reach)} people reached · {formatCount(totals.reactions)} reactions
      </p>
      {posts.length === 0 ? (
        <p className="py-8 text-center text-text-muted">
          No post was published in this period. Create one from Social posts.
        </p>
      ) : (
        <ul aria-label="Social posts" className="divide-y divide-border">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} mostReach={mostReach} timeZone={timeZone} />
          ))}
        </ul>
      )}
      <p className="pt-2 text-sm text-text-muted">
        Facebook and Instagram update these numbers for up to 2 days. Link taps and orders from
        posts are not tracked yet, because Dakly links in posts are not tracked.
      </p>
    </Card>
  );
}

function PostRow({
  post,
  mostReach,
  timeZone,
}: {
  post: AnalyticsSocialPostRow;
  mostReach: number;
  timeZone: string;
}) {
  const share = Math.max(2, Math.round(((post.reach ?? 0) / mostReach) * 100));
  const where = post.networks.map((network) => networkLabels[network]).join(' + ');
  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{post.caption}</p>
        <span aria-hidden className="mt-2 block h-1.5 max-w-xl rounded-full bg-surface-muted">
          <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${share}%` }} />
        </span>
        <p className="mt-1 text-sm text-text-muted">
          {where} · {formatShortDate(post.publishedAt, timeZone)}
        </p>
      </div>
      <dl className="grid grid-cols-4 gap-3 text-right text-sm whitespace-nowrap">
        <Figure label="Reached" value={countOrDash(post.reach)} />
        <Figure label="Reactions" value={countOrDash(post.reactions)} />
        <Figure label="Link taps" value={countOrDash(post.linkTaps)} />
        <Figure label="Result" value="—" />
      </dl>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const countOrDash = (value: number | null) => (value === null ? '—' : formatCount(value));
