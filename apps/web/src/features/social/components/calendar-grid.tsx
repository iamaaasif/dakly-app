import { cn } from '@dakly/ui/cn';

import { canMove, entriesByDay, type CalendarEntry } from '../post-calendar';
import { PostChip } from './post-chip';

const weekdayNames = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

type CalendarGridProps = {
  weeks: string[][];
  entries: CalendarEntry[];
  today: string;
  // Days outside this month are dimmed; null for a week view.
  month: string | null;
  tall?: boolean;
  onOpen: (entry: CalendarEntry) => void;
  // Set when the person can move posts by dropping them on another day.
  onMove?: (entry: CalendarEntry, day: string) => void;
};

export function CalendarGrid({
  weeks,
  entries,
  today,
  month,
  tall,
  onOpen,
  onMove,
}: CalendarGridProps) {
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
              <DayCell
                key={day}
                day={day}
                outside={outside}
                isToday={day === today}
                tall={tall}
                entries={entries}
                dayEntries={days.get(day) ?? []}
                onOpen={onOpen}
                onMove={onMove}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

type DayCellProps = Pick<CalendarGridProps, 'tall' | 'entries' | 'onOpen' | 'onMove'> & {
  day: string;
  outside: boolean;
  isToday: boolean;
  dayEntries: CalendarEntry[];
};

function DayCell({
  day,
  outside,
  isToday,
  tall,
  entries,
  dayEntries,
  onOpen,
  onMove,
}: DayCellProps) {
  return (
    <div
      role="gridcell"
      onDragOver={onMove && ((event) => event.preventDefault())}
      onDrop={(event) => {
        // Firefox otherwise opens the dropped text as a page.
        if (onMove) event.preventDefault();
        const dropped = entries.find(
          ({ post }) => post.id === event.dataTransfer.getData('text/plain'),
        );
        if (dropped && canMove(dropped) && dropped.dayKey !== day) onMove?.(dropped, day);
      }}
      className={cn(
        'min-w-0 space-y-1 border-r border-b border-border p-1 last:border-r-0 md:p-2',
        tall ? 'min-h-64' : 'min-h-16 md:min-h-32',
      )}
    >
      <p
        className={cn(
          'grid size-7 place-items-center text-sm',
          outside && 'text-text-subtle',
          isToday && 'rounded-full bg-action font-semibold text-on-primary',
        )}
      >
        <time dateTime={day}>{Number(day.slice(8))}</time>
      </p>
      {dayEntries.map((entry) => (
        <PostChip
          key={entry.post.id}
          entry={entry}
          draggable={Boolean(onMove) && canMove(entry)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
