export function percent(part: number, whole: number) {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

// Glossary: money from marketing ÷ message cost, rounded to whole ৳, hidden when cost is ৳0.
export function returnPerTaka(revenue: bigint, cost: bigint) {
  return cost === 0n ? null : Number((revenue + cost / 2n) / cost);
}
