import { MessageSquare } from 'lucide-react';

import { OVERDUE_DAYS, type DueListCustomerResponse } from '@dakly/contracts/due-book';
import { formatMoney } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';

import { DueHistory } from './due-history';
import { formatShortDate } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';
import { initialsOf } from '@/lib/initials';

const DAY_MS = 24 * 60 * 60 * 1000;

type DueCustomerRowProps = {
  customer: DueListCustomerResponse;
  now: number;
  canEdit: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onRemind: () => void;
  onCollect: () => void;
};

export function DueCustomerRow({ customer, now, historyOpen, ...actions }: DueCustomerRowProps) {
  const label = customer.name ?? customer.phone ?? 'Customer';
  // The list holds only customers who owe, so the date is there; null is for the one-customer route.
  const oldest = customer.oldestDebtAt ? Date.parse(customer.oldestDebtAt) : now;
  const days = Math.max(0, Math.floor((now - oldest) / DAY_MS));
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-muted font-semibold"
        >
          {initialsOf(label)}
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="font-semibold wrap-anywhere">{label}</p>
          <p className="wrap-anywhere text-text-muted">
            {customer.phone ? `${formatPhone(customer.phone)} · ` : ''}
            {customer.lastRemindedAt
              ? `Reminded ${formatShortDate(customer.lastRemindedAt)}`
              : 'Never reminded'}
          </p>
        </div>
        <div className="w-full sm:w-auto sm:text-right">
          <p className="font-semibold text-danger">{formatMoney(customer.balancePoisha)}</p>
          <p className={days > OVERDUE_DAYS ? 'text-sm text-danger' : 'text-sm text-text-muted'}>
            Oldest {days} {days === 1 ? 'day' : 'days'}
          </p>
        </div>
        <RowActions label={label} historyOpen={historyOpen} {...actions} />
      </div>
      {historyOpen && (
        <div className="mt-3 sm:ml-15">
          <DueHistory contactId={customer.contactId} />
        </div>
      )}
    </li>
  );
}

type RowActionsProps = Pick<
  DueCustomerRowProps,
  'canEdit' | 'historyOpen' | 'onToggleHistory' | 'onRemind' | 'onCollect'
> & { label: string };

function RowActions({
  label,
  canEdit,
  historyOpen,
  onToggleHistory,
  onRemind,
  onCollect,
}: RowActionsProps) {
  return (
    <div className="flex w-full justify-end gap-2 sm:w-auto">
      <Button
        variant="secondary"
        aria-expanded={historyOpen}
        aria-label={`${historyOpen ? 'Hide' : 'History'} for ${label}`}
        onClick={onToggleHistory}
      >
        {historyOpen ? 'Hide' : 'History'}
      </Button>
      {canEdit && (
        <>
          <Button variant="secondary" aria-label={`Remind ${label}`} onClick={onRemind}>
            <MessageSquare aria-hidden="true" size={16} strokeWidth={1.75} />
            Remind
          </Button>
          <Button
            aria-label={`Collect from ${label}`}
            onClick={onCollect}
            className="bg-inverse hover:bg-inverse/90"
          >
            Collect
          </Button>
        </>
      )}
    </div>
  );
}
