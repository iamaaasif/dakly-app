'use client';
import { Send } from 'lucide-react';
import Link from 'next/link';

import {
  dueListFilters,
  type DueListFilter,
  type DueSummaryResponse,
} from '@dakly/contracts/due-book';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { dueFilterLabels } from '../due-labels';

type DueFiltersProps = {
  filter: DueListFilter;
  summary: DueSummaryResponse;
  canRemind: boolean;
  reminding: boolean;
  onRemindOverdue: () => void;
};

export function DueFilters({
  filter,
  summary,
  canRemind,
  reminding,
  onRemindOverdue,
}: DueFiltersProps) {
  const counts: Record<DueListFilter, number> = {
    all: summary.customersOwing,
    over_30_days: summary.overdueCustomers,
    never_reminded: summary.neverRemindedCustomers,
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Filter the Due book" className="flex flex-wrap gap-2">
        {dueListFilters.map((name) => (
          <Link
            key={name}
            href={name === 'all' ? '/due-book' : `/due-book?filter=${name}`}
            aria-current={filter === name ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              filter === name
                ? 'border-inverse bg-inverse text-on-primary'
                : 'border-border-strong bg-surface hover:bg-surface-muted',
            )}
          >
            {dueFilterLabels[name]} <span>{counts[name]}</span>
          </Link>
        ))}
      </nav>
      {canRemind && (
        <Button
          variant="secondary"
          loading={reminding}
          disabled={summary.overdueCustomers === 0}
          onClick={onRemindOverdue}
        >
          <Send aria-hidden="true" size={16} strokeWidth={1.75} />
          Remind all over 30 days ({summary.overdueCustomers})
        </Button>
      )}
    </div>
  );
}
