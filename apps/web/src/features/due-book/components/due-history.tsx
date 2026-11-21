import type { DueHistoryItem } from '@dakly/contracts/due-book';
import { formatMoney } from '@dakly/contracts/money';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useDueHistory } from '../api/due-history';
import { dueEntryKindLabels } from '../due-labels';
import { formatShortDate } from '@/lib/format-date';

type DueHistoryProps = { contactId: string };

export function DueHistory({ contactId }: DueHistoryProps) {
  const history = useDueHistory(contactId, true);
  if (history.isPending) return <Skeleton className="h-10 w-full" />;
  if (history.isError)
    return <QueryError message={history.error.message} onRetry={() => void history.refetch()} />;
  if (!history.data.items.length) return <p className="text-text-muted">No entries yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {history.data.items.map((entry) => (
        <HistoryEntry key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function HistoryEntry({ entry }: { entry: DueHistoryItem }) {
  const adds = entry.kind === 'baki';
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="min-w-0 wrap-anywhere">
        <span className="mr-4 text-text-muted">{formatShortDate(entry.occurredAt)}</span>
        {entry.note ?? dueEntryKindLabels[entry.kind]}
      </span>
      <span className={adds ? 'font-medium text-danger' : 'font-medium text-success'}>
        {adds ? '+' : '-'}
        {formatMoney(entry.amountPoisha)}
      </span>
    </li>
  );
}
