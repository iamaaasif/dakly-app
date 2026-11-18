import type { AutomationStep } from '@dakly/contracts/automations/graph';
import { weekdays } from '@dakly/contracts/automations/graph';

import { DAY_MS, MINUTE_MS } from '../platform/time';

type Wait = Extract<AutomationStep, { kind: 'wait' }>['wait'];

// Waits are not quiet hours: a send at the end of one defers on its own. Waking on a reply or tap
// and on the Messenger window come with CHAT-2, so an event wait lasts its timeout and a window
// wait has no open window to wait for.
export function wakeTime(wait: Wait, now: Date, timeZone: string): Date {
  switch (wait.until) {
    case 'duration':
      return new Date(now.getTime() + wait.minutes * MINUTE_MS);
    case 'event':
      return new Date(now.getTime() + wait.timeoutMinutes * MINUTE_MS);
    case 'window_closing':
      return now;
    case 'time_of_day':
      return nextLocalTime(now, timeZone, wait.time);
    case 'weekday':
      return nextLocalTime(now, timeZone, wait.time, weekdays.indexOf(wait.weekday));
  }
}

// Store time zones have no daylight saving (Asia/Dhaka), so every local day is 24 hours.
function nextLocalTime(now: Date, timeZone: string, time: string, weekday?: number): Date {
  const local = localDayAndTime(now, timeZone);
  const target = (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * MINUTE_MS;
  const days = weekday === undefined ? 0 : (weekday - local.weekday + 7) % 7;
  let ahead = days * DAY_MS + target - local.intoDay;
  if (ahead < 0) ahead += weekday === undefined ? DAY_MS : 7 * DAY_MS;
  return new Date(now.getTime() + ahead);
}

function localDayAndTime(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const seconds =
    (Number(part('hour')) * 60 + Number(part('minute'))) * 60 + Number(part('second'));
  return {
    weekday: weekdays.findIndex((day) => day === part('weekday').toLowerCase()),
    intoDay: seconds * 1000 + at.getUTCMilliseconds(),
  };
}
