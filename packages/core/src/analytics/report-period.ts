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
