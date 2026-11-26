import { OrderInvoiceScreen } from '@/features/orders/components/order-invoice-screen';
import { requireSession } from '@/lib/require-session';

export default async function OrderInvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewOrders)
    return (
      <p role="status" className="p-6">
        You do not have Orders access in this shop.
      </p>
    );
  const { orderId } = await params;
  return <OrderInvoiceScreen orderId={orderId} />;
}
