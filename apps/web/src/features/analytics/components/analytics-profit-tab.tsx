import type { AnalyticsProfitResponse, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount, formatMoney } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useAnalyticsProfit } from '../api/analytics-overview';
import { AnalyticsChange } from './analytics-change';

export function AnalyticsProfitTab({ view }: { view: AnalyticsView }) {
  const query = useAnalyticsProfit(view.period);
  if (query.isPending)
    return <Skeleton role="status" aria-label="Loading profit" className="h-64 w-full" />;
  if (query.error)
    return (
      <QueryError
        message={query.error.message}
        onRetry={() => query.refetch()}
        retryLabel="Retry profit"
      />
    );
  const data = query.data;
  const profit = BigInt(data.profit.currentPoisha);
  return (
    <section aria-label="Profit" className="space-y-4">
      <p className="text-text-muted">
        What your marketing orders left after the goods, delivery and messages were paid for.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-sm font-medium text-text-muted">Profit from marketing</h2>
          <p
            className={cn(
              'text-3xl font-bold tabular-nums',
              profit < 0n ? 'text-danger' : 'text-text',
            )}
          >
            {formatMoney(profit)}
          </p>
          {view.compare && (
            <AnalyticsChange
              total={profit}
              previous={BigInt(data.profit.previousPoisha)}
              minimum={0n}
            />
          )}
          <p className="text-text-muted">{returnLine(data)}</p>
          {data.excludedOrders.current > 0 && (
            <p role="note" className="text-sm text-warning">
              Excludes {formatCount(data.excludedOrders.current)}{' '}
              {data.excludedOrders.current === 1 ? 'order' : 'orders'} without a cost price. Add the
              cost to your products to count them.
            </p>
          )}
        </Card>
        <HowProfitAddsUp data={data} />
      </div>
    </section>
  );
}

function returnLine(data: AnalyticsProfitResponse) {
  const { current } = data.returnPerTaka;
  if (current === null) return 'No message cost in this period, so there is no return per ৳1.';
  return current < 0
    ? `You lost ${formatMoney(BigInt(-current) * 100n)} of profit for every ৳1 spent on messages.`
    : `${formatMoney(BigInt(current) * 100n)} of profit for every ৳1 spent on messages.`;
}

function HowProfitAddsUp({ data }: { data: AnalyticsProfitResponse }) {
  const rows = [
    { label: 'Money from marketing', value: data.revenue.currentPoisha, sign: '' },
    { label: 'Cost of goods', value: data.productCost.currentPoisha, sign: '−' },
    { label: 'Delivery and COD fees', value: data.deliveryCost.currentPoisha, sign: '−' },
    { label: 'Cost of messages', value: data.messageCost.currentPoisha, sign: '−' },
  ];
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">How profit adds up</h2>
      <p className="text-sm text-text-muted">
        From {formatCount(data.countedOrders.current)} orders with every cost price known.
      </p>
      <dl className="divide-y divide-border">
        {rows.map(({ label, value, sign }) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2">
            <dt>{label}</dt>
            <dd className="tabular-nums">
              {sign}
              {formatMoney(BigInt(value))}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 py-2 font-semibold">
          <dt>Profit</dt>
          <dd className="tabular-nums">{formatMoney(BigInt(data.profit.currentPoisha))}</dd>
        </div>
      </dl>
    </Card>
  );
}
