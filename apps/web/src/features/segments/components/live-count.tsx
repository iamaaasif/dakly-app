'use client';
import { useWatch } from 'react-hook-form';

import { formatCount } from '@dakly/contracts/money';
import {
  type CreateSegmentInput,
  reachableChannels,
  segmentRulesSchema,
} from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { cn } from '@dakly/ui/cn';

import { useSegmentCount } from '../api/segment-count';
import { channelLabels } from '../segment-labels';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export function LiveCount() {
  const rules = useWatch<CreateSegmentInput, 'rules'>({ name: 'rules' });
  // Compared as text: the watched tree can change inside the same object.
  const settled = useDebouncedValue(JSON.stringify(rules), 400);
  const parsed = segmentRulesSchema.safeParse(JSON.parse(settled));
  const count = useSegmentCount(parsed.success ? parsed.data : undefined);

  return (
    <Card className="h-fit space-y-4 p-4 lg:sticky lg:top-4">
      <h2 className="text-base font-semibold">Summary</h2>
      <div aria-live="polite">{countState(parsed.success, count)}</div>
    </Card>
  );
}

function countState(valid: boolean, count: ReturnType<typeof useSegmentCount>) {
  if (!valid)
    return (
      <p className="text-sm text-text-muted">
        Finish each condition to see how many contacts match.
      </p>
    );
  if (count.error)
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-danger">{count.error.message}</p>
        <Button variant="secondary" onClick={() => void count.refetch()}>
          Count again
        </Button>
      </div>
    );
  if (!count.data)
    return (
      <div role="status" className="space-y-3">
        <p className="sr-only">Counting</p>
        <div className="h-4 w-28 rounded-sm bg-neutral-soft" />
        <div className="h-9 w-20 rounded-sm bg-neutral-soft" />
      </div>
    );
  const { count: total, reachable } = count.data;
  // Dimmed while a newer count loads, so the number does not jump to a spinner.
  return (
    <div className={cn('space-y-5 transition-opacity', count.isFetching && 'opacity-50')}>
      <div className="space-y-1">
        <p className="text-sm text-text-muted">Estimated contacts</p>
        <p className="text-title font-bold tabular-nums">{formatCount(total)}</p>
      </div>
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm text-text-muted">Can be messaged on</p>
        {reachableChannels.map((channel) => (
          <ReachableRow
            key={channel}
            label={channelLabels[channel]}
            value={reachable[channel]}
            total={total}
          />
        ))}
      </div>
    </div>
  );
}

function ReachableRow({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-base">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{formatCount(value)}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-neutral-soft">
        <div
          className="h-full origin-left rounded-full bg-action transition-transform"
          style={{ transform: `scaleX(${total ? value / total : 0})` }}
        />
      </div>
    </div>
  );
}
