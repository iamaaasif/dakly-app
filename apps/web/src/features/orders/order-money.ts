export function poishaInput(value: string): number | undefined {
  const amount = value.trim();
  if (!amount) return undefined;
  if (!/^\d+(?:\.\d{0,2})?$/.test(amount)) return NaN;
  const [taka, poisha = ''] = amount.split('.');
  return Number(taka + poisha.padEnd(2, '0'));
}
