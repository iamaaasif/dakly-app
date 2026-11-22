import { productScreenQuerySchema } from '@dakly/contracts/products';

type RawQuery = Record<string, string | string[] | undefined>;

export function parseProductsScreen(raw: RawQuery) {
  const parsed = productScreenQuerySchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { adjust, create, import: importing, product, productTab, ...query } = parsed.data;
  return { query, adjust, create, importing, productId: product, productTab };
}
