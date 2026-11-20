const WHOLE_NUMBER_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatCount(value: number | bigint): string {
  return WHOLE_NUMBER_FORMAT.format(value);
}

export function formatMoney(amountPoisha: number | bigint): string {
  if (typeof amountPoisha === 'number' && !Number.isSafeInteger(amountPoisha)) {
    throw new RangeError('Money must be a safe integer in poisha');
  }

  const amount = BigInt(amountPoisha);
  const magnitude = amount < 0n ? -amount : amount;
  const wholeTaka = formatCount(magnitude / 100n);
  const poisha = magnitude % 100n;
  const fraction = poisha === 0n ? '' : `.${poisha.toString().padStart(2, '0')}`;
  const sign = amount < 0n ? '-' : '';
  return `${sign}৳${wholeTaka}${fraction}`;
}

export function formatWholeTaka(amountPoisha: bigint): string {
  const halfTaka = amountPoisha < 0n ? -50n : 50n;
  return formatMoney(((amountPoisha + halfTaka) / 100n) * 100n);
}

export function takaInputFromPoisha(value: number | null) {
  if (value === null) return '';
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}
