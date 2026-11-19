import { DAY_MS, MINUTE_MS } from '../platform/time';

type PostingSlot = { weekday: number; time: string };

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
  const ordered = [...slots].sort((left, right) => left.time.localeCompare(right.time));
  for (let day = Date.parse(firstDay); ; day += DAY_MS) {
    const date = new Date(day);
    const localDay = date.toISOString().slice(0, 10);
    for (const slot of ordered) {
      if (slot.weekday !== date.getUTCDay()) continue;
      const selected = slotInstant(formatter, `${localDay} ${slot.time}:00`);
      if (selected >= earliest && !reserved.has(selected)) return new Date(selected);
    }
  }
}

function slotInstant(formatter: Intl.DateTimeFormat, localTime: string): number {
  const nominal = Date.parse(`${localTime.replace(' ', 'T')}Z`);
  // Use the earlier instant when a clock change repeats a local time. Skip times that never occur.
  const valid = [-DAY_MS, DAY_MS]
    .map((shift) => {
      const reference = nominal + shift;
      const localReference = formatter.format(new Date(reference));
      const offset = Date.parse(`${localReference.replace(' ', 'T')}Z`) - reference;
      return nominal - offset;
    })
    .filter((instant) => formatter.format(new Date(instant)) === localTime);
  return valid.length ? Math.min(...valid) : Number.NaN;
}
