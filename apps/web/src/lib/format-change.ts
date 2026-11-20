import { formatCount } from '@dakly/contracts/money';

// One decimal place, rounded half up, so the same two totals read the same on every screen.
export function formatChange(total: bigint, previous: bigint): string {
  if (previous === 0n) return 'New';
  const delta = total - previous;
  if (delta === 0n) return '0.0%';
  const magnitude = delta < 0n ? -delta : delta;
  const tenths = (magnitude * 1000n + previous / 2n) / previous;
  return `${delta < 0n ? '-' : '+'}${formatCount(tenths / 10n)}.${tenths % 10n}%`;
}

export type ChangeLabel = { variant: 'success' | 'danger' | 'neutral'; text: string };

// Analytics says "Up 23%" in whole percent; fewer than `minimum` on either side is too few to compare.
export function describeChange(total: bigint, previous: bigint, minimum = 0n): ChangeLabel {
  if (total < minimum || previous < minimum)
    return { variant: 'neutral', text: 'Too few to compare' };
  if (previous === 0n) return { variant: 'neutral', text: 'New' };
  if (total === previous) return { variant: 'neutral', text: 'No change' };
  const magnitude = total > previous ? total - previous : previous - total;
  const percent = formatCount((magnitude * 100n + previous / 2n) / previous);
  return total > previous
    ? { variant: 'success', text: `Up ${percent}%` }
    : { variant: 'danger', text: `Down ${percent}%` };
}
