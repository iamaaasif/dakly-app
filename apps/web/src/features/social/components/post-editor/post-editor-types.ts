import type { CreatePostInput, SchedulePostInput } from '@dakly/contracts/social';

import { formatShortDateTime } from '@/lib/format-date';

export type PostWhen =
  { mode: 'draft' } | { mode: 'queue' } | { mode: 'time'; scheduledFor: string } | { mode: 'now' };

export type PostEditorSubmit = (post: CreatePostInput, when: PostWhen) => void;

export function scheduleOf(when: PostWhen): SchedulePostInput | undefined {
  if (when.mode === 'queue') return { nextSlot: true };
  if (when.mode === 'time') return { scheduledFor: when.scheduledFor };
  // The API only accepts a future time, so "now" is the next minute.
  if (when.mode === 'now') return { scheduledFor: new Date(Date.now() + 60_000).toJSON() };
  return undefined;
}

export function whenLabelOf(choice: 'queue' | 'time' | 'now', time: string): string {
  if (choice === 'now') return 'Just now';
  if (choice === 'time' && time) return formatShortDateTime(new Date(time).toJSON());
  return 'Next open slot';
}

export function submitButtonLabel(choice: 'queue' | 'time' | 'now'): string {
  if (choice === 'now') return 'Publish now';
  return choice === 'time' ? 'Schedule' : 'Add to queue';
}
