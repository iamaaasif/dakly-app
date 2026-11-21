import { useState } from 'react';

import type {
  AiFeedbackItem,
  AiFeedbackQuery,
  AiFeedbackResponse,
} from '@dakly/contracts/ai-feedback';
import { formatCount } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useAiFeedback } from '../api/ai-feedback';
import { FeedbackItemCard } from './feedback-item-card';
import { feedbackReasonLabels } from './feedback-reasons';
import { FixReplyDialog } from './fix-reply-dialog';

type Filter = AiFeedbackQuery['filter'];
const filterLabels: Record<Filter, string> = {
  needs_fixing: 'Needs fixing',
  bad: 'Bad answers',
  good: 'Good answers',
  all: 'All',
};
const emptyText: Record<Filter, string> = {
  needs_fixing: 'Every bad answer is fixed.',
  bad: 'No bad answers rated yet.',
  good: 'No good answers rated yet.',
  all: 'Nothing is rated yet. Rate an AI reply in a chat with the thumbs buttons.',
};

type FeedbackTabProps = {
  filter: Filter;
  canFix: boolean;
  onFilterChange: (filter: Filter) => void;
};

export function FeedbackTab({ filter, canFix, onFilterChange }: FeedbackTabProps) {
  const feedback = useAiFeedback(filter);
  const [fixing, setFixing] = useState<AiFeedbackItem | null>(null);
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
      <FeedbackSummary summary={summary} />
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {(Object.keys(filterLabels) as Filter[]).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === filter}
            onClick={() => onFilterChange(name)}
            className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-base hover:bg-surface-muted aria-pressed:border-inverse aria-pressed:bg-inverse aria-pressed:font-semibold aria-pressed:text-on-primary"
          >
            {filterLabels[name]}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-text-muted">{emptyText[filter]}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <FeedbackItemCard
              key={item.messageId}
              item={item}
              onFix={canFix ? setFixing : undefined}
            />
          ))}
        </ul>
      )}
      {fixing ? <FixReplyDialog item={fixing} onDone={() => setFixing(null)} /> : null}
    </div>
  );
}

function FeedbackSummary({ summary }: { summary: AiFeedbackResponse['summary'] }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Helpful"
          value={summary.helpfulPercent === null ? '–' : `${summary.helpfulPercent}%`}
          tone="text-success"
        />
        <Stat label="Good answers" value={formatCount(summary.goodCount)} tone="text-text" />
        <Stat label="Bad answers" value={formatCount(summary.badCount)} tone="text-danger" />
        <Stat label="Fixed and learned" value={formatCount(summary.fixedCount)} tone="text-info" />
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
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-surface-muted p-3">
      <dd className={`text-lg font-semibold ${tone}`}>{value}</dd>
      <dt className="text-sm text-text-muted">{label}</dt>
    </div>
  );
}
