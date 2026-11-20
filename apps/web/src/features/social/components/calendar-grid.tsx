import { cn } from '@dakly/ui/cn';

import { entriesByDay, type CalendarEntry } from '../post-calendar';
import { PostChip } from './post-chip';

const weekdayNames = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

type CalendarGridProps = {
  weeks: string[][];
  entries: CalendarEntry[];
  today: string;
  // Days outside this month are dimmed; null for a week view.
  month: string | null;
  tall?: boolean;
};

export function CalendarGrid({ weeks, entries, today, month, tall }: CalendarGridProps) {
  const days = entriesByDay(entries);
  return (
    <div role="grid" aria-label="Calendar" className="border-t border-border">
      <div role="row" className="grid grid-cols-7 border-b border-border bg-background">
        {weekdayNames.map((name) => (
          <div
            key={name}
            role="columnheader"
            className="px-2 py-2 text-xs font-medium tracking-wide text-text-muted uppercase md:px-3"
          >
            {name}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role="row" className="grid grid-cols-7">
          {week.map((day) => {
            const outside = month !== null && !day.startsWith(month);
            return (
              <div
                key={day}
                role="gridcell"
                className={cn(
                  'min-w-0 space-y-1 border-r border-b border-border p-1 last:border-r-0 md:p-2',
                  tall ? 'min-h-64' : 'min-h-16 md:min-h-32',
                )}
              >
                <p
                  className={cn(
                    'grid size-7 place-items-center text-sm',
                    outside && 'text-text-subtle',
                    day === today && 'rounded-full bg-action font-semibold text-on-primary',
                  )}
                >
                  <time dateTime={day}>{Number(day.slice(8))}</time>
                </p>
                {(days.get(day) ?? []).map((entry) => (
                  <PostChip key={entry.post.id} entry={entry} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
