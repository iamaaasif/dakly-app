import { DAY_MS, HOUR_MS } from '../platform/time';

// Every 6 hours for the first 7 days, then daily until day 30. Null ends the refreshes.
export function nextMetricsAt(publishedAt: Date, now: Date) {
  const age = now.getTime() - publishedAt.getTime();
  const next = now.getTime() + (age < 7 * DAY_MS ? 6 * HOUR_MS : DAY_MS);
  return next > publishedAt.getTime() + 30 * DAY_MS ? null : new Date(next);
}

// The first refresh comes 6 hours after the post goes out.
export function publishedSchedule(publishedAt: Date) {
  return { publishedAt, nextMetricsAt: nextMetricsAt(publishedAt, publishedAt) };
}
