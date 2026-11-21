import { REMINDER_FIRST_HOUR, REMINDER_LAST_HOUR } from '@dakly/contracts/due-book';

// SHOP-R4: 9 am up to 8 pm in the shop's own time.
export function isInsideReminderHours(at: Date, timeZone: string): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', hour: 'numeric' })
      .formatToParts(at)
      .find((part) => part.type === 'hour')?.value,
  );
  return hour >= REMINDER_FIRST_HOUR && hour < REMINDER_LAST_HOUR;
}
