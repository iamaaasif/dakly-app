import { orderScreenQuerySchema } from '@dakly/contracts/orders';

type RawQuery = Record<string, string | string[] | undefined>;

export function parseOrdersScreen(raw: RawQuery) {
  const parsed = orderScreenQuerySchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { selected, ...query } = parsed.data;
  return {
    query: { ...query, stage: query.stage ?? (query.alert ? undefined : ('to_confirm' as const)) },
    selected,
  };
}
