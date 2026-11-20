import type { AnalyticsFunnelStep } from '@dakly/contracts/analytics';

import type { Totals } from './analytics-message-totals';
import { percent } from './analytics-ratios';

export function funnel(
  all: Totals,
  readable: Totals,
  people: { delivered: number; tapped: number },
  ordered: number,
) {
  // An order can follow a read with no tap, so Ordered can pass the step before it; that has no sensible percent.
  const step = (count: number, before: number): AnalyticsFunnelStep => {
    const share = percent(count, before);
    return { count, percentOfPrevious: share !== null && share > 100 ? null : share };
  };
  return {
    sent: { count: all.sent, percentOfPrevious: null },
    delivered: step(all.delivered, all.sent),
    // The read step divides by delivered on the channels that report reads, not by all delivered.
    read: step(readable.read, readable.delivered),
    // Tapped counts people, so it is measured against people delivered to, as the tap rate is.
    tapped: step(people.tapped, people.delivered),
    ordered: step(ordered, people.tapped),
  };
}
