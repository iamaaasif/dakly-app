'use client';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import type { DueListCustomerResponse, DueListFilter } from '@dakly/contracts/due-book';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { useToast } from '@dakly/ui/toast';

import { useDueCustomers } from '../api/due-customers';
import { useDueSummary } from '../api/due-summary';
import { useRemindOverdue } from '../api/remind';
import { AddBakiDialog } from './add-baki-dialog';
import { CollectDialog } from './collect-dialog';
import { DueCustomerRow } from './due-customer-row';
import { DueFilters } from './due-filters';
import { DueSummaryCards } from './due-summary-cards';
import { RemindDialog } from './remind-dialog';
import { useSessionContext } from '@/lib/session-context';

type Action = { kind: 'add' } | { kind: 'collect' | 'remind'; customer: DueListCustomerResponse };

export function DueBookScreen({ filter }: { filter: DueListFilter }) {
  const [action, setAction] = useState<Action | null>(null);
  const { data: context } = useSessionContext();
  const canEdit = Boolean(context?.currentStore?.canEditDueBook);
  const close = () => setAction(null);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Due book</h1>
          <p className="text-text-muted">
            Your baki khata, digital. See who owes you, remind them politely and record payments.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setAction({ kind: 'add' })}
            className="bg-primary hover:bg-primary-hover"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add baki
          </Button>
        )}
      </div>
      <SummarySection filter={filter} canEdit={canEdit} />
      <CustomersSection filter={filter} canEdit={canEdit} onAction={setAction} />
      <p className="text-text-muted">
        Baki from Shop sales is added here by itself. Reminders are only sent to people who owe you.
      </p>
      {action?.kind === 'add' && <AddBakiDialog onClose={close} />}
      {action?.kind === 'collect' && <CollectDialog customer={action.customer} onClose={close} />}
      {action?.kind === 'remind' && <RemindDialog customer={action.customer} onClose={close} />}
    </main>
  );
}

type SectionProps = { filter: DueListFilter; canEdit: boolean };

function SummarySection({ filter, canEdit }: SectionProps) {
  const summary = useDueSummary();
  const remindOverdue = useRemindOverdue();
  const showToast = useToast();

  function remindEveryoneOverdue() {
    remindOverdue.mutate(undefined, {
      onSuccess: ({ queued, skippedRecentlyReminded, skippedNoPhone, skippedBlocked }) => {
        const skipped = skippedRecentlyReminded + skippedNoPhone + skippedBlocked;
        const left = skipped
          ? ` ${skipped} left out: reminded in the last 7 days, no phone or blocked.`
          : '';
        showToast(
          `${queued} polite ${queued === 1 ? 'reminder' : 'reminders'} sent by SMS.${left}`,
        );
      },
    });
  }

  if (summary.isError)
    return <QueryError message={summary.error.message} onRetry={() => void summary.refetch()} />;
  if (!summary.data) return <Skeleton className="h-32 w-full" />;
  return (
    <>
      <DueSummaryCards summary={summary.data} />
      <DueFilters
        filter={filter}
        summary={summary.data}
        canRemind={canEdit}
        reminding={remindOverdue.isPending}
        onRemindOverdue={remindEveryoneOverdue}
      />
      {remindOverdue.error && (
        <p role="alert" className="text-danger">
          {remindOverdue.error.message}
        </p>
      )}
    </>
  );
}

type CustomersSectionProps = SectionProps & { onAction: (action: Action) => void };

function CustomersSection({ filter, canEdit, onAction }: CustomersSectionProps) {
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  // Fixed at first render so every row counts its days from the same moment.
  const [now] = useState(() => Date.now());
  const customers = useDueCustomers(filter);

  if (customers.isError)
    return (
      <QueryError message={customers.error.message} onRetry={() => void customers.refetch()} />
    );
  if (!customers.data) return <Skeleton className="h-64 w-full" />;
  const rows = customers.data.pages.flatMap((page) => page.items);
  if (!rows.length)
    return (
      <p role="status" className="rounded-lg border border-border bg-surface p-6 text-text-muted">
        No one owes you here. Add baki to start your Due book.
      </p>
    );
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {rows.map((customer) => (
          <DueCustomerRow
            key={customer.contactId}
            customer={customer}
            now={now}
            canEdit={canEdit}
            historyOpen={openHistory === customer.contactId}
            onToggleHistory={() =>
              setOpenHistory(openHistory === customer.contactId ? null : customer.contactId)
            }
            onRemind={() => onAction({ kind: 'remind', customer })}
            onCollect={() => onAction({ kind: 'collect', customer })}
          />
        ))}
      </ul>
      {customers.hasNextPage && (
        <Button
          variant="secondary"
          loading={customers.isFetchingNextPage}
          onClick={() => void customers.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
