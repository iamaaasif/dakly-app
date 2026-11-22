import Link from 'next/link';

import { OrdersScreen } from '@/features/orders/components/orders-screen';
import { parseOrdersScreen } from '@/features/orders/orders-url';
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
  const screen = parseOrdersScreen(await searchParams);
  if (!screen)
    return (
      <p role="alert" className="p-6">
        This address is invalid.{' '}
        <Link href="/orders" className="inline-flex min-h-10 items-center text-action underline">
          Open orders
        </Link>
        .
      </p>
    );
  return <OrdersScreen {...screen} />;
}
