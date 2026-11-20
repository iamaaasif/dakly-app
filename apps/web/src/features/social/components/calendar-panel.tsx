import { Calendar, Columns2, List } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import type { SocialAccount } from '../api/get-social-accounts';
import {
  monthWeeks,
  shiftDay,
  shiftMonth,
  statusLabels,
  weekOf,
  type CalendarEntry,
  type CalendarStatus,
} from '../post-calendar';
import type { CalendarView } from '../use-my-posts-params';
import { CalendarGrid } from './calendar-grid';
import { statusDots } from './post-chip';
import { PostListView } from './post-list-view';
import { formatDayMonth, formatMonthYear } from '@/lib/format-date';

const views = [
  { value: 'month', label: 'Month', icon: Calendar },
  { value: 'week', label: 'Week', icon: Columns2 },
  { value: 'list', label: 'List', icon: List },
] as const;
const legend: CalendarStatus[] = ['scheduled', 'needs_attention', 'published', 'failed'];

type CalendarPanelProps = {
  accounts: SocialAccount[];
  entries: CalendarEntry[];
  hasPosts: boolean;
  canEdit: boolean;
  view: CalendarView;
  date: string;
  today: string;
  accountId: string | null;
  setParams: (changes: Record<string, string | null>) => void;
};

function heading(view: CalendarView, date: string) {
  if (view !== 'week') return formatMonthYear(date.slice(0, 7));
  const days = weekOf(date);
  return `${formatDayMonth(days[0]!)} – ${formatDayMonth(days[6]!)}`;
}

type ToolbarProps = Pick<
  CalendarPanelProps,
  'accounts' | 'view' | 'date' | 'accountId' | 'setParams'
>;

function CalendarToolbar({ accounts, view, date, accountId, setParams }: ToolbarProps) {
  const month = date.slice(0, 7);
  const step = (by: number) =>
    setParams({ date: view === 'week' ? shiftDay(date, 7 * by) : `${shiftMonth(month, by)}-01` });
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <Button variant="secondary" onClick={() => setParams({ date: null })}>
        Today
      </Button>
      <Button variant="secondary" aria-label="Previous" className="px-2" onClick={() => step(-1)}>
        ‹
      </Button>
      <Button variant="secondary" aria-label="Next" className="px-2" onClick={() => step(1)}>
        ›
      </Button>
      <h2 className="mr-auto text-lg font-semibold">{heading(view, date)}</h2>
      <Select
        value={accountId ?? 'all'}
        onValueChange={(value) => setParams({ account: value === 'all' ? null : value })}
      >
        <SelectTrigger aria-label="Filter by account" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map(({ id, displayName }) => (
            <SelectItem key={id} value={id}>
              {displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div role="group" aria-label="Calendar view" className="flex rounded-md bg-surface-muted p-1">
        {views.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setParams({ view: value })}
            className={cn(
              'flex min-h-8 items-center gap-1.5 rounded-sm px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              view === value ? 'shadow-sm bg-surface font-medium' : 'text-text-muted',
            )}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CalendarPanel(props: CalendarPanelProps) {
  const { accounts, entries, hasPosts, canEdit, view, date, today, accountId, setParams } = props;
  const month = date.slice(0, 7);
  return (
    <section aria-label="Calendar" className="rounded-lg border border-border bg-surface">
      <CalendarToolbar
        accounts={accounts}
        view={view}
        date={date}
        accountId={accountId}
        setParams={setParams}
      />
      <ul
        aria-label="Colour legend"
        className="flex flex-wrap gap-4 px-4 pb-3 text-sm text-text-muted"
      >
        {legend.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('size-2 rounded-full', statusDots[status])} />
            {statusLabels[status]}
          </li>
        ))}
      </ul>
      {!hasPosts && (
        <p className="flex flex-wrap items-center gap-3 border-t border-border p-4 text-text-muted">
          No posts planned yet.
          {canEdit && (
            <Link href="/social/posts/new" className="font-medium text-action hover:underline">
              Plan your first post
            </Link>
          )}
        </p>
      )}
      {view === 'list' ? (
        <PostListView entries={entries.filter(({ dayKey }) => dayKey.startsWith(month))} />
      ) : (
        <CalendarGrid
          weeks={view === 'week' ? [weekOf(date)] : monthWeeks(month)}
          entries={entries}
          today={today}
          month={view === 'week' ? null : month}
          tall={view === 'week'}
        />
      )}
    </section>
  );
}
