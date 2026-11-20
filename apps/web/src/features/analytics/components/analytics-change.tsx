import { TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@dakly/ui/badge';

import { describeChange } from '@/lib/format-change';

const flipped = { success: 'danger', danger: 'success', neutral: 'neutral' } as const;

export function AnalyticsChange({
  total,
  previous,
  minimum,
  lowerIsBetter,
}: {
  total: bigint;
  previous: bigint;
  minimum?: bigint;
  // Spending more is not good news, so a rise in cost shows as a warning, not as growth.
  lowerIsBetter?: boolean;
}) {
  const change = describeChange(total, previous, minimum);
  const variant = lowerIsBetter ? flipped[change.variant] : change.variant;
  const text = change.text;
  const Trend = total < previous ? TrendingDown : TrendingUp;
  return (
    <Badge variant={variant} className="w-fit gap-1 rounded-full px-2.5 py-1 tabular-nums">
      {variant !== 'neutral' && <Trend aria-hidden="true" size={14} strokeWidth={1.75} />}
      {text}
    </Badge>
  );
}
