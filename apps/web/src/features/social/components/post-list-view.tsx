import { Badge } from '@dakly/ui/badge';

import {
  entriesByDay,
  statusLabels,
  type CalendarEntry,
  type CalendarStatus,
} from '../post-calendar';
import { networkNames } from '../social-labels';
import { NetworkIcon } from './network-icon';
import { postTitle } from './post-chip';
import { formatDayLong, formatTime } from '@/lib/format-date';

const badgeVariants = {
  scheduled: 'warning',
  needs_attention: 'danger',
  published: 'success',
  failed: 'danger',
} as const satisfies Record<CalendarStatus, string>;

type PostListViewProps = { entries: CalendarEntry[] };

export function PostListView({ entries }: PostListViewProps) {
  const days = [...entriesByDay(entries)];
  if (!days.length)
    return <p className="border-t border-border p-6 text-text-muted">No posts in this month.</p>;
  return (
    <div className="border-t border-border">
      {days.map(([day, dayEntries]) => (
        <section key={day} aria-label={formatDayLong(day)}>
          <h3 className="bg-background px-4 py-2 text-sm font-semibold">{formatDayLong(day)}</h3>
          <ul className="divide-y divide-border">
            {dayEntries.map((entry) => (
              <li key={entry.post.id}>
                <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="w-20 shrink-0 font-medium">{formatTime(entry.at)}</span>
                  <span className="flex gap-1">
                    {entry.kinds.map((kind) => (
                      <NetworkIcon key={kind} kind={kind} size="small" />
                    ))}
                  </span>
                  <span className="min-w-40 flex-1 truncate">{postTitle(entry)}</span>
                  <span className="sr-only">
                    {entry.kinds.map((kind) => networkNames[kind]).join(' and ')}
                  </span>
                  <Badge variant={badgeVariants[entry.status]}>{statusLabels[entry.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
