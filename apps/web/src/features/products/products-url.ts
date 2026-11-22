import { productScreenQuerySchema } from '@dakly/contracts/products';

type RawQuery = Record<string, string | string[] | undefined>;

export function parseProductsScreen(raw: RawQuery) {
  const parsed = productScreenQuerySchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { adjust, import: importing, ...query } = parsed.data;
  return { query, adjust, importing };
}
