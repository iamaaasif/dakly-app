import { DAY_MS } from '../platform/time';

export type ReportPeriod = { from: string; through: string };

export function reportDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

export function shiftReportDay(day: string, days: number): string {
  return new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);
}
