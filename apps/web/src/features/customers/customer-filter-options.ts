import type { ContactListQuery } from '@dakly/contracts/contacts';
import { contactListSorts, contactListTypes, lastPurchaseWindows } from '@dakly/contracts/contacts';

import { contactSourceLabels } from './customer-columns';
import { customerTypeLabels } from './customer-labels';

export const customerTabs = [
  { type: undefined, label: 'All' },
  ...contactListTypes.map((type) => ({ type, label: customerTypeLabels[type] })),
];

export const sourceOptions = Object.entries(contactSourceLabels).map(([value, label]) => ({
  value,
  label,
}));

// Poisha, so ৳1,000 is 100,000. Each range ends one poisha before the next starts.
export const spendRanges = [
  { id: 'under_1000', label: 'Under ৳1,000', max: 99_999 },
  { id: '1000_to_10000', label: '৳1,000 to ৳10,000', min: 100_000, max: 999_999 },
  { id: '10000_to_50000', label: '৳10,000 to ৳50,000', min: 1_000_000, max: 4_999_999 },
  { id: 'over_50000', label: '৳50,000 and over', min: 5_000_000 },
] as const;

export function spendRangeOf(query: Pick<ContactListQuery, 'minSpendPoisha' | 'maxSpendPoisha'>) {
  return spendRanges.find(
    (range) =>
      ('min' in range ? range.min : undefined) === query.minSpendPoisha &&
      ('max' in range ? range.max : undefined) === query.maxSpendPoisha,
  );
}

const purchaseWindowLabels = {
  '7_days': 'Last 7 days',
  '30_days': 'Last 30 days',
  '90_days': 'Last 90 days',
  over_90_days: 'Over 90 days ago',
  never: 'Never',
} as const;

// Everyone on this page has ordered, so "never" would always be empty.
export const purchaseWindowOptions = lastPurchaseWindows
  .filter((window) => window !== 'never')
  .map((value) => ({ value, label: purchaseWindowLabels[value] }));

const sortLabels = {
  last_purchase: 'Last purchase',
  highest_spend: 'Highest spend',
  most_orders: 'Most orders',
  name: 'Name',
  newest: 'Newest',
} as const;

export const sortOptions = contactListSorts.map((value) => ({ value, label: sortLabels[value] }));
