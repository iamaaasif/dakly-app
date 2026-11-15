const TAKA_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatMoney(amountPoisha: number): string {
  if (!Number.isSafeInteger(amountPoisha)) {
    throw new RangeError('Money must be a safe integer in poisha');
  }

  const amount = BigInt(amountPoisha);
  const magnitude = amount < 0n ? -amount : amount;
  const wholeTaka = TAKA_FORMAT.format(magnitude / 100n);
  const poisha = magnitude % 100n;
  const fraction = poisha === 0n ? '' : `.${poisha.toString().padStart(2, '0')}`;
  const sign = amount < 0n ? '-' : '';
  return `${sign}৳${wholeTaka}${fraction}`;
}
