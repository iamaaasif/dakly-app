// Vendor cost is kept in millionths of a US dollar; staff read it as dollars.
export function formatMicroUsd(microUsd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(microUsd / 1_000_000);
}
