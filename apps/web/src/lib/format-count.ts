const counts = new Intl.NumberFormat('en-US');

export function formatCount(value: number): string {
  return counts.format(value);
}
