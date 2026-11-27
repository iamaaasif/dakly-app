import { productScreenQuerySchema } from '@dakly/contracts/products';

type RawQuery = Record<string, string | string[] | undefined>;

// Best selling is the default sort. A cursor made for another sort, or an old link with a
// cursor that no longer fits, sends the person to the first page instead of an error.
export function parseProductsScreen(raw: RawQuery) {
  const withSort = { ...raw, sort: raw.sort ?? 'best_selling' };
  const parsed =
    productScreenQuerySchema.safeParse(withSort).data ??
    productScreenQuerySchema.safeParse({ ...withSort, cursor: undefined }).data;
  if (!parsed) return undefined;
  const { adjust, import: importing, ...query } = parsed;
  return { query, adjust, importing };
}
