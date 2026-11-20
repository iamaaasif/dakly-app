import type { ProductResponse, ProductVariantResponse } from '@dakly/contracts/products';

import { formatMoney } from '@/lib/format-money';

export function productPriceRange(product: ProductResponse): string | null {
  const prices = product.variants.map((variant) => variant.pricePoisha);
  if (!prices.length) return null;
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  if (maximum === 0) return null;
  return minimum === maximum
    ? formatMoney(minimum)
    : `${formatMoney(minimum)}–${formatMoney(maximum)}`;
}

function firstVariantWithCost(product: ProductResponse): ProductVariantResponse | undefined {
  return product.variants.find((variant) => variant.costPoisha !== null && variant.pricePoisha > 0);
}

export function firstVariantProfitPercent(product: ProductResponse): string | null {
  const variant = firstVariantWithCost(product);
  if (!variant || variant.costPoisha === null) return null;
  const profit = Math.round(
    ((variant.pricePoisha - variant.costPoisha) / variant.pricePoisha) * 100,
  );
  return `${profit}% profit`;
}

export function firstVariantProfitAmount(product: ProductResponse): string {
  const variant = firstVariantWithCost(product);
  if (!variant || variant.costPoisha === null) return '—';
  const profitPoisha = variant.pricePoisha - variant.costPoisha;
  return formatMoney(profitPoisha);
}

export function firstVariantCostAmount(product: ProductResponse): string {
  const variant = firstVariantWithCost(product);
  if (!variant || variant.costPoisha === null) return 'Not set';
  return formatMoney(variant.costPoisha);
}
