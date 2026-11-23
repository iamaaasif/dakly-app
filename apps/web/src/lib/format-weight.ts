// Under a kilo the courier price bands are read in grams; above it, in kilos.
export function formatWeight(grams: number): string {
  if (grams < 1000) return `${grams} g`;
  return `${Number((grams / 1000).toFixed(2))} kg`;
}
