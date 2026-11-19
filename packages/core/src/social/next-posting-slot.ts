import type { PostingSlot } from '@dakly/contracts/social';

import { DAY_MS, MINUTE_MS } from '../platform/time';

export const recommendedPostingSlots = Array.from({ length: 7 }, (_, weekday) =>
  ['12:30', '20:30'].map((time) => ({ weekday, time })),
).flat();

export function nextPostingSlot(
  slots: PostingSlot[],
  now: Date,
  timeZone: string,
  reserved: ReadonlySet<number>,
): Date | null {
  if (!slots.length) return null;
  const earliest = now.getTime() + 15 * MINUTE_MS;
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  const firstDay = formatter.format(new Date(earliest)).slice(0, 10);
  for (let day = Date.parse(firstDay); ; day += DAY_MS) {
    const date = new Date(day);
    const localDay = date.toISOString().slice(0, 10);
    let next = Infinity;
    for (const slot of slots) {
      if (slot.weekday !== date.getUTCDay()) continue;
      const instants = slotInstants(formatter, `${localDay} ${slot.time}:00`);
      // Both occurrences share the same local slot when the clock goes back.
      if (instants.some((instant) => reserved.has(instant))) continue;
      for (const instant of instants) {
        if (instant >= earliest) next = Math.min(next, instant);
      }
    }
    if (Number.isFinite(next)) return new Date(next);
  }
}

function slotInstants(formatter: Intl.DateTimeFormat, localTime: string): number[] {
  const nominal = Date.parse(`${localTime.replace(' ', 'T')}Z`);
  return [-DAY_MS, DAY_MS]
    .map((shift) => {
      const reference = nominal + shift;
      const localReference = formatter.format(new Date(reference));
      const offset = Date.parse(`${localReference.replace(' ', 'T')}Z`) - reference;
      return nominal - offset;
    })
    .filter((instant) => formatter.format(new Date(instant)) === localTime);
}
