export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const JOB_POLL_INTERVAL_MS = 30 * 1000;

// The moment this calendar day began in the given time zone; a shop's "today" follows its own clock.
export function startOfDayIn(timeZone: string, now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const sinceMidnightMs = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  return new Date(now.getTime() - now.getMilliseconds() - sinceMidnightMs);
}
