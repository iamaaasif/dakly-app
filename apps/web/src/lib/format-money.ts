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
