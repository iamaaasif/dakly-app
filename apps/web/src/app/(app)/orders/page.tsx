import Link from 'next/link';

import { orderScreenQuerySchema } from '@dakly/contracts/orders';

import { OrdersScreen } from '@/features/orders/components/orders-screen';
import { requireSession } from '@/lib/require-session';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewOrders)
    return (
      <p role="status" className="p-6">
        You do not have Orders access in this shop.
      </p>
    );
  const parsed = orderScreenQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This address is invalid. <Link href="/orders">Open orders</Link>.
      </p>
    );
  const { selected, ...query } = parsed.data;
  return (
    <OrdersScreen
      query={{ ...query, stage: query.stage ?? (query.alert ? undefined : 'to_confirm') }}
      selected={selected}
    />
  );
}
