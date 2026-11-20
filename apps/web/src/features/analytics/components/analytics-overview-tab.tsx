import type { AnalyticsOverviewResponse, AnalyticsView } from '@dakly/contracts/analytics';
import { formatCount } from '@dakly/contracts/money';
import { Card } from '@dakly/ui/card';

import { RevenueChart } from './revenue-chart';

export function AnalyticsOverviewTab({
  data,
  view,
}: {
  data: AnalyticsOverviewResponse;
  view: AnalyticsView;
}) {
  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Money from your marketing</h2>
          <p className="text-text-muted">By channel. Tap a channel below to hide or show it.</p>
        </div>
        <RevenueChart data={data} compare={view.compare} />
      </Card>
      <Funnel funnel={data.funnel} />
    </div>
  );
}

const steps = [
  { key: 'sent', label: 'Sent' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'read', label: 'Read (not SMS)' },
  { key: 'tapped', label: 'Tapped' },
  { key: 'ordered', label: 'Ordered' },
] as const;

function Funnel({ funnel }: { funnel: AnalyticsOverviewResponse['funnel'] }) {
  const widest = Math.max(1, funnel.sent.count);
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">From message to order</h2>
      <ol className="space-y-3">
        {steps.map(({ key, label }) => {
          const { count, percentOfPrevious } = funnel[key];
          return (
            <li
              key={key}
              className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
            >
              <span>{label}</span>
              <span aria-hidden className="h-3 rounded-full bg-surface-muted">
                <span
                  className="block h-3 rounded-full bg-primary"
                  style={{ width: `${Math.max(1, (Math.min(count, widest) / widest) * 100)}%` }}
                />
              </span>
              <span className="tabular-nums sm:text-right">
                <span className="font-semibold">{formatCount(count)}</span>
                {percentOfPrevious !== null && (
                  <span className="ml-2 text-sm text-text-muted">
                    {percentOfPrevious}% of the step before
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
