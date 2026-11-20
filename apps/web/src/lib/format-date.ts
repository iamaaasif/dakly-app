const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDateTime(value: string): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(parseInstant(value));
  return `${formatted} (Asia/Dhaka)`;
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

export function formatRelativeTime(value: string, now = Date.now()): string {
  const minutes = Math.trunc((parseInstant(value) - now) / 60_000);
  const hours = Math.trunc(minutes / 60);
  if (Math.abs(hours) >= 24) return relativeTime.format(Math.trunc(hours / 24), 'day');
  if (hours) return relativeTime.format(hours, 'hour');
  return minutes ? relativeTime.format(minutes, 'minute') : 'Just now';
}

export function formatDate(value: string, reference: string, timeZone = 'Asia/Dhaka'): string {
  const instant = parseInstant(value);
  const date = calendarDate(instant, timeZone);
  const today = calendarDate(parseInstant(reference), timeZone);
  if (date.day === today.day) return 'Today';
  if (date.day === today.day - 1) return 'Yesterday';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    ...(date.year === today.year ? {} : { year: 'numeric' }),
  }).format(instant);
}

export function formatCalendarDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'full' }).format(
    parseInstant(value),
  );
}

export function localHour(value: string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(
      parseInstant(value),
    ),
  );
}

export function formatTime(value: string, timeZone = 'Asia/Dhaka'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(parseInstant(value))
    .toLowerCase();
}

function parseInstant(value: string): number {
  const components = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T/i.exec(value);
  const timestamp = Date.parse(value);
  if (!components || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(timestamp)) {
    throw new RangeError('Dates must be valid instants with an explicit UTC offset');
  }

  const year = Number(components[1]);
  const month = Number(components[2]);
  const day = Number(components[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    throw new RangeError('Dates must have a valid calendar date');
  }
  return timestamp;
}

function calendarDate(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === 'year')!.value);
  const month = Number(parts.find((part) => part.type === 'month')!.value);
  const day = Number(parts.find((part) => part.type === 'day')!.value);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return { year, day: date.getTime() / DAY_MS };
}

export function formatShortDate(value: string, timeZone = 'Asia/Dhaka'): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(
    parseInstant(value),
  );
}

export function formatShortDateTime(value: string, timeZone = 'Asia/Dhaka'): string {
  return `${formatShortDate(value, timeZone)}, ${formatTime(value, timeZone)}`;
}

export function formatTimeZone(timeZone: string): string {
  const offset = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')
    ?.value.replace(/^GMT([+-])0?(\d+):00$/, 'GMT$1$2');
  const city = timeZone.split('/').at(-1)?.replaceAll('_', ' ') ?? timeZone;
  return offset ? `${city} time (${offset})` : `${city} time`;
}
