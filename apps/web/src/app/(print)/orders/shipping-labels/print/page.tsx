import Link from 'next/link';

import {
  shippingLabelQuerySchema,
  shippingLabelsPhoneRequired,
} from '@dakly/contracts/order-shipping-labels';

import { OrderShippingLabelsScreen } from '@/features/orders/components/order-shipping-labels-screen';
import { requireSession } from '@/lib/require-session';

export default async function OrderShippingLabelsPage({
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
  if (!session.currentStore.canPrintShippingLabels)
    return <p className="p-6">{shippingLabelsPhoneRequired}</p>;

  const batch = shippingLabelQuerySchema.safeParse(await searchParams);
  if (batch.success) return <OrderShippingLabelsScreen orderIds={batch.data.orderIds} />;
  return (
    <p role="alert" className="p-6">
      This label selection is empty or invalid.{' '}
      <Link href="/orders" className="inline-flex min-h-10 items-center text-action underline">
        Choose orders
      </Link>
      .
    </p>
  );
}
