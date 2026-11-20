import { DAY_MS } from '../platform/time';

export type ReportPeriod = { from: string; through: string };

export function reportDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

export function shiftReportDay(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function retainedSince(day: string): string {
  const cutoff = new Date(day);
  const month = cutoff.getUTCMonth();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  if (cutoff.getUTCMonth() !== month) cutoff.setUTCDate(0);
  return cutoff.toISOString().slice(0, 10);
}

// Month-to-date against the same number of days of the month before, so a quarter-way month is not
// compared with a whole one. A short earlier month ends on its last day.
export function monthToDate(day: string) {
  const from = `${day.slice(0, 8)}01`;
  const lastMonthEnd = shiftReportDay(from, -1);
  const lastMonthFrom = `${lastMonthEnd.slice(0, 8)}01`;
  const sameDay = shiftReportDay(lastMonthFrom, Number(day.slice(8)) - 1);
  return {
    current: { from, through: day },
    previous: { from: lastMonthFrom, through: sameDay < lastMonthEnd ? sameDay : lastMonthEnd },
  };
}
