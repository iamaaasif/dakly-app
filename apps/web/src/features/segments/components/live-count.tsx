'use client';
import { useWatch } from 'react-hook-form';

import { type CreateSegmentInput, segmentRulesSchema } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useSegmentCount } from '../api/segment-count';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { matchText } from '../segment-labels';

export function LiveCount() {
  const rules = useWatch<CreateSegmentInput, 'rules'>({ name: 'rules' });
  // Compared as text: the watched tree can change inside the same object.
  const settled = useDebouncedValue(JSON.stringify(rules), 400);
  const parsed = segmentRulesSchema.safeParse(JSON.parse(settled));
  const count = useSegmentCount(parsed.success ? parsed.data : undefined);
  return (
    <Card className="h-fit space-y-2">
      <h2 className="text-md font-semibold">Estimated customers</h2>
      <div aria-live="polite">{countState(parsed.success, count)}</div>
    </Card>
  );
}

function countState(valid: boolean, count: ReturnType<typeof useSegmentCount>) {
  if (!valid) return <p>Finish each condition to see how many customers match.</p>;
  if (count.error)
    return (
      <div role="alert" className="space-y-2">
        <p>{count.error.message}</p>
        <Button variant="secondary" onClick={() => void count.refetch()}>
          Count again
        </Button>
      </div>
    );
  if (!count.data) return <p>Counting…</p>;
  return (
    <>
      <p className="text-xl font-bold tabular-nums">{matchText(count.data.count)}</p>
      {count.isFetching ? <p className="text-sm text-text-muted">Updating…</p> : null}
    </>
  );
}
