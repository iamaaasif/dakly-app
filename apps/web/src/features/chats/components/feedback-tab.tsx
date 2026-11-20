import type { AiFeedbackQuery } from '@dakly/contracts/ai-feedback';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useAiFeedback } from '../api/ai-feedback';
import { FeedbackItemCard } from './feedback-item-card';
import { feedbackReasonLabels } from './feedback-reasons';

type Filter = AiFeedbackQuery['filter'];
const filterLabels: Record<Filter, string> = {
  bad: 'Bad answers',
  good: 'Good answers',
  all: 'All',
};
const emptyText: Record<Filter, string> = {
  bad: 'No bad answers rated yet.',
  good: 'No good answers rated yet.',
  all: 'Nothing is rated yet. Rate an AI reply in a chat with the thumbs buttons.',
};

type FeedbackTabProps = { filter: Filter; onFilterChange: (filter: Filter) => void };

export function FeedbackTab({ filter, onFilterChange }: FeedbackTabProps) {
  const feedback = useAiFeedback(filter);
  if (feedback.isPending) return <Skeleton className="h-96 w-full" />;
  if (feedback.isError)
    return <QueryError message={feedback.error.message} onRetry={() => void feedback.refetch()} />;
  const { summary, items } = feedback.data;
  return (
    <div className="space-y-4">
      <p className="text-text-muted">
        Every good or bad rating you give in Chats lands here. Dakly's replies get better when you
        fix a bad answer once.
      </p>
      <dl className="grid grid-cols-3 gap-3">
        <Stat
          label="Helpful"
          value={summary.helpfulPercent === null ? '–' : `${summary.helpfulPercent}%`}
        />
        <Stat label="Good answers" value={String(summary.goodCount)} />
        <Stat label="Bad answers" value={String(summary.badCount)} />
      </dl>
      {summary.commonProblems.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Most common problems:
          {summary.commonProblems.map((problem) => (
            <Badge key={problem.reason} variant="danger">
              {feedbackReasonLabels[problem.reason]} {problem.count}×
            </Badge>
          ))}
        </p>
      ) : null}
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as Filter[]).map((name) => (
          <Button
            key={name}
            variant={name === filter ? 'primary' : 'secondary'}
            aria-pressed={name === filter}
            onClick={() => onFilterChange(name)}
          >
            {filterLabels[name]}
          </Button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-text-muted">{emptyText[filter]}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <FeedbackItemCard key={item.messageId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dd className="text-lg font-semibold">{value}</dd>
      <dt className="text-sm text-text-muted">{label}</dt>
    </div>
  );
}
