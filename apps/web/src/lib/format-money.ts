import { formatMoney } from '@dakly/contracts/money';

export function formatWholeTaka(amountPoisha: bigint): string {
  const halfTaka = amountPoisha < 0n ? -50n : 50n;
  return formatMoney(((amountPoisha + halfTaka) / 100n) * 100n);
}

export function takaInputFromPoisha(value: number | null) {
  if (value === null) return '';
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}

export function formatCompactTaka(amountPoisha: bigint): string {
  const taka = Number(amountPoisha / 100n);
  if (taka >= 10_000_000) return `৳${(taka / 10_000_000).toFixed(1)}Cr`;
  if (taka >= 100_000) return `৳${(taka / 100_000).toFixed(1)}L`;
  if (taka >= 1_000) return `৳${(taka / 1_000).toFixed(1)}K`;
  return `৳${taka}`;
}
