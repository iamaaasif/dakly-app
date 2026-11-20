import { formatCount } from '@dakly/contracts/money';

export type ChangeLabel = { variant: 'success' | 'danger' | 'neutral'; text: string };

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
