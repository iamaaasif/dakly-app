import { describe, expect, it } from 'vitest';

import { countSmsParts } from '@dakly/contracts/sms';

import { bakiNoticeText, reminderText } from './due-message-templates';
import { isInsideReminderHours } from './due-reminder-hours';

describe('due message templates', () => {
  it('writes the baki notice with the amount and the total', () => {
    expect(bakiNoticeText('রিনার দোকান', 95000, 175000)).toBe(
      'রিনার দোকান: ৳950 বাকি যোগ হয়েছে। মোট বাকি ৳1,750। ধন্যবাদ।',
    );
  });

  it('writes a polite reminder with no offer, link or fee', () => {
    const text = reminderText('রিনার দোকান', 175000);
    expect(text).toBe(
      'রিনার দোকান: প্রিয় গ্রাহক, আপনার ৳1,750 বাকি আছে। সুবিধামতো পরিশোধ করলে কৃতজ্ঞ থাকব। ধন্যবাদ।',
    );
    expect(text).not.toMatch(/https?:|জরিমানা|ছাড়/);
  });

  it('keeps a notice for a short shop name in one SMS part', () => {
    expect(countSmsParts(bakiNoticeText('রিনা', 95000, 175000))).toBe(1);
  });
});

describe('reminder hours', () => {
  const at = (iso: string) => new Date(iso);

  it('allows 9 am up to 8 pm in Dhaka and nothing else', () => {
    // Dhaka is UTC+6.
    expect(isInsideReminderHours(at('2026-11-21T02:59:00Z'), 'Asia/Dhaka')).toBe(false);
    expect(isInsideReminderHours(at('2026-11-21T03:00:00Z'), 'Asia/Dhaka')).toBe(true);
    expect(isInsideReminderHours(at('2026-11-21T13:59:00Z'), 'Asia/Dhaka')).toBe(true);
    expect(isInsideReminderHours(at('2026-11-21T14:00:00Z'), 'Asia/Dhaka')).toBe(false);
  });

  it('reads the hour in the shop time zone, not UTC', () => {
    expect(isInsideReminderHours(at('2026-11-21T12:00:00Z'), 'Asia/Dhaka')).toBe(true);
    expect(isInsideReminderHours(at('2026-11-21T12:00:00Z'), 'UTC')).toBe(true);
    expect(isInsideReminderHours(at('2026-11-21T22:00:00Z'), 'UTC')).toBe(false);
  });
});
