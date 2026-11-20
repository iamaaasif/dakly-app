import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { sortPublished, type CalendarEntry, type PublishedSort } from '../post-calendar';
import { PublishedRow } from './published-row';

const sorts: { value: PublishedSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'reach', label: 'Most reach' },
  { value: 'reactions', label: 'Most reactions' },
];

type PublishedListProps = {
  entries: CalendarEntry[];
  sort: PublishedSort;
  onSort: (sort: PublishedSort) => void;
  onOpen: (entry: CalendarEntry) => void;
};

export function PublishedList({ entries, sort, onSort, onOpen }: PublishedListProps) {
  return (
    <section aria-label="Published posts" className="rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-text-muted">
          Results update every 6 hours for the first 7 days, then daily for 30 days.
        </p>
        <Select value={sort} onValueChange={(value) => onSort(value as PublishedSort)}>
          <SelectTrigger aria-label="Sort published posts" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>
      {entries.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {sortPublished(entries, sort).map((entry) => (
            <PublishedRow key={entry.post.id} entry={entry} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-border p-6 text-text-muted">
          Nothing published yet. Posts appear here with their results once they go out.
        </p>
      )}
    </section>
  );
}
