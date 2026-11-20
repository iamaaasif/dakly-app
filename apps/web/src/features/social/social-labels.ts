import type { PostingSlot } from '@dakly/contracts/social';

import type { SocialAccount } from './api/get-social-accounts';

export const networkNames: Record<SocialAccount['kind'], string> = {
  facebook_page: 'Facebook',
  instagram: 'Instagram',
};

export const accountTypeLabels: Record<SocialAccount['kind'], string> = {
  facebook_page: 'Facebook Page',
  instagram: 'Instagram',
};

// The week starts on Saturday, as in the design. Slot weekdays count from Sunday as 0.
export const weekdays = [
  { weekday: 6, label: 'Sat' },
  { weekday: 0, label: 'Sun' },
  { weekday: 1, label: 'Mon' },
  { weekday: 2, label: 'Tue' },
  { weekday: 3, label: 'Wed' },
  { weekday: 4, label: 'Thu' },
  { weekday: 5, label: 'Fri' },
] as const;

export function formatSlotTime(time: PostingSlot['time']): string {
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(3, 5));
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}
