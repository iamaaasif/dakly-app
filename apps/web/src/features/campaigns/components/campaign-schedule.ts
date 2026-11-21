import { z } from 'zod';

import type { CampaignChannel } from '@dakly/contracts/campaigns';

import { dhakaDayKey, dhakaTimeOfDay } from '@/lib/format-date';

// Send times are Bangladesh time, which has no daylight saving, so a fixed offset is exact.
const dhakaOffset = '+06:00';
const hourMs = 60 * 60 * 1000;
// Matches the API: a Messenger campaign sent later finds almost every 24 hour window closed.
const messengerLimitMs = 23 * hourMs;

export const scheduleSchema = z.object({
  mode: z.enum(['now', 'later']),
  date: z.string(),
  time: z.string(),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export function scheduleValuesOf(scheduledFor: string | null): ScheduleInput {
  if (!scheduledFor) return { mode: 'now', date: '', time: '' };
  return { mode: 'later', date: dhakaDayKey(scheduledFor), time: dhakaTimeOfDay(scheduledFor) };
}

// Null means "on approval": either Send now, or a time that is not filled in yet.
export function scheduledForOf({ mode, date, time }: ScheduleInput): string | null {
  if (mode === 'now' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const instant = new Date(`${date}T${time}:00${dhakaOffset}`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function scheduleProblem(
  schedule: ScheduleInput,
  channel: CampaignChannel,
  now: Date,
): string | undefined {
  if (schedule.mode === 'now') return undefined;
  const scheduledFor = scheduledForOf(schedule);
  if (!scheduledFor) return 'Pick a date and time.';
  const untilSend = new Date(scheduledFor).getTime() - now.getTime();
  if (untilSend <= 0) return 'Pick a time that has not passed yet.';
  if (channel === 'messenger' && untilSend > messengerLimitMs)
    return 'A Messenger campaign can be scheduled up to 23 hours ahead.';
  return undefined;
}

// A "later" time that is missing, past or too far ahead stops the approval before the API does.
export function isScheduleBlocked(schedule: ScheduleInput, channel: CampaignChannel) {
  return Boolean(scheduleProblem(schedule, channel, new Date()));
}
