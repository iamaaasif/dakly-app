// Bangladesh groups digits by lakh and crore, so ৳12,34,567.
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

// Plain taka with two decimals for a file or an input, such as 1250.50. It goes through bigint, so
// a large amount never turns into a float.
export function poishaToTakaText(amountPoisha: number | bigint | string): string {
  const amount = BigInt(amountPoisha);
  const magnitude = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
}
