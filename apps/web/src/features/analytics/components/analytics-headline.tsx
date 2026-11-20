import type { AnalyticsOverviewResponse, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';

import { channelLabels } from '../analytics-labels';
import { AnalyticsChange } from './analytics-change';
import { RevenueSparkline } from './revenue-sparkline';
import { formatWholeTaka } from '@/lib/format-money';

const periodWords = { 30: '30 days', 90: '3 months', 365: '12 months' } as const;

export function AnalyticsHeadline({
  data,
  view,
}: {
  data: AnalyticsOverviewResponse;
  view: AnalyticsView;
}) {
  const { revenue, orders } = data.marketing;
  const period = periodWords[view.period];
  const paid = data.channels.filter(({ costPoisha }) => BigInt(costPoisha) > 0n);
  return (
    <Card className="grid gap-6 bg-linear-to-b from-primary-soft to-surface md:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-semibold">Your marketing earned</h2>
        <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-2">
          <p className="text-3xl font-bold tabular-nums md:text-4xl">
            {formatWholeTaka(BigInt(revenue.currentPoisha))}
          </p>
          <RevenueSparkline points={data.marketing.dailyRevenuePoisha} />
        </div>
        <p className="text-lg">
          from {formatCount(orders.current)} {orders.current === 1 ? 'order' : 'orders'} in the last{' '}
          {period}
        </p>
        {view.compare && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <AnalyticsChange
              total={BigInt(revenue.currentPoisha)}
              previous={BigInt(revenue.previousPoisha)}
            />
            vs the {period} before
          </div>
        )}
      </div>
      <Card className="flex flex-col justify-center gap-2 bg-surface p-5">
        {data.returnPerTaka !== null && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-bold text-success tabular-nums">
              {formatWholeTaka(BigInt(data.returnPerTaka) * 100n)}
            </span>
            <span className="text-lg font-medium">
              came back for every ৳1 you spent on messages
            </span>
          </p>
        )}
        <p className="text-sm text-text-muted">
          You spent {formatWholeTaka(BigInt(data.messages.cost.currentPoisha))} on messages
          {paid.length > 0 && ` (${paid.map(({ channel }) => channelLabels[channel]).join(', ')})`}.
        </p>
      </Card>
    </Card>
  );
}
