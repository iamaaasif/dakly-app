import type { DueEntryKind, DuePaymentMethod } from '@dakly/contracts/due-book';

export const dueEntryKindLabels: Record<DueEntryKind, string> = {
  baki: 'Baki',
  payment: 'Payment',
  write_off: 'Written off',
};

// The collect form offers the methods the design shows; the API accepts the others too.
export const collectMethods: { method: DuePaymentMethod; label: string }[] = [
  { method: 'cash', label: 'Cash' },
  { method: 'bkash', label: 'bKash' },
  { method: 'nagad', label: 'Nagad' },
];

export const dueFilterLabels = {
  all: 'All',
  over_30_days: 'Over 30 days',
  never_reminded: 'Never reminded',
} as const;
