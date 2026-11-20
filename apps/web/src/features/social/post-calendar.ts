import type { PostResponse } from '@dakly/contracts/social';

import type { SocialAccount } from './api/get-social-accounts';
import { dhakaDayKey } from '@/lib/format-date';

export type CalendarStatus = 'scheduled' | 'needs_attention' | 'published' | 'failed';

export type CalendarEntry = {
  post: PostResponse;
  at: string;
  dayKey: string;
  status: CalendarStatus;
  kinds: SocialAccount['kind'][];
};

const pending = new Set(['scheduled', 'publishing', 'waiting_approval']);

function isBlocked(
  post: PostResponse,
  account: SocialAccount | undefined,
  target: PostResponse['targets'][number],
) {
  if (!pending.has(target.status) || !account) return false;
  return (
    account.status === 'needs_reconnect' ||
    (account.kind === 'instagram' && !post.mediaFileIds.length)
  );
}

function statusOf(targets: PostResponse['targets'], blocked: boolean): CalendarStatus {
  if (targets.some(({ status }) => status === 'failed')) return 'failed';
  if (blocked) return 'needs_attention';
  return targets.some(({ status }) => pending.has(status)) ? 'scheduled' : 'published';
}

// A post is shown once, at its earliest time, in the worst state of its accounts.
export function buildEntries(
  posts: PostResponse[],
  accounts: SocialAccount[],
  accountId: string | null,
): CalendarEntry[] {
  return posts.flatMap((post) => {
    const targets = post.targets.filter(
      (target) =>
        target.status !== 'cancelled' &&
        target.status !== 'draft' &&
        (target.scheduledFor ?? target.publishedAt) &&
        (!accountId || target.channelConnectionId === accountId),
    );
    const times = targets
      .map((target) => target.publishedAt ?? target.scheduledFor)
      .filter((time): time is string => Boolean(time))
      .sort();
    const at = times[0];
    if (!at) return [];
    const accountOf = (target: (typeof targets)[number]) =>
      accounts.find(({ id }) => id === target.channelConnectionId);
    const blocked = targets.some((target) => isBlocked(post, accountOf(target), target));
    const status = statusOf(targets, blocked);
    const kinds = [...new Set(targets.flatMap((target) => accountOf(target)?.kind ?? []))].sort();
    return [{ post, at, dayKey: dhakaDayKey(at), status, kinds }];
  });
}

export function entriesByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const days = new Map<string, CalendarEntry[]>();
  for (const entry of [...entries].sort((a, b) => a.at.localeCompare(b.at)))
    days.set(entry.dayKey, [...(days.get(entry.dayKey) ?? []), entry]);
  return days;
}

function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The week starts on Saturday, as in the design.
function weekStart(dayKey: string): string {
  const weekday = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return addDays(dayKey, -((weekday + 1) % 7));
}

export function weekOf(dayKey: string): string[] {
  const start = weekStart(dayKey);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  const weeks: string[][] = [];
  for (let start = weekStart(first); start <= last; start = addDays(start, 7))
    weeks.push(weekOf(start));
  return weeks;
}

export function shiftMonth(month: string, by: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

export function shiftDay(dayKey: string, by: number): string {
  return addDays(dayKey, by);
}

export const statusLabels: Record<CalendarStatus, string> = {
  scheduled: 'Scheduled',
  needs_attention: 'Needs attention',
  published: 'Published',
  failed: 'Failed',
};

export type PublishedSort = 'newest' | 'reach' | 'reactions';

export function publishedTotals(post: PostResponse) {
  const published = post.targets.filter(({ status }) => status === 'published');
  const sum = (pick: (target: (typeof published)[number]) => number | null) => {
    const values = published.map(pick).filter((value): value is number => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  return {
    reach: sum(({ reach }) => reach),
    reactions: sum(({ reactions }) => reactions),
    comments: sum(({ comments }) => comments),
    linkTaps: sum(({ linkTaps }) => linkTaps),
  };
}

export function sortPublished(entries: CalendarEntry[], sort: PublishedSort): CalendarEntry[] {
  const key = (entry: CalendarEntry) =>
    publishedTotals(entry.post)[sort === 'reach' ? 'reach' : 'reactions'] ?? -1;
  return [...entries].sort((a, b) =>
    sort === 'newest' ? b.at.localeCompare(a.at) : key(b) - key(a) || b.at.localeCompare(a.at),
  );
}
