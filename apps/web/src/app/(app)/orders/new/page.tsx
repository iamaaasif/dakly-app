import Link from 'next/link';

import { NewOrderPage } from '@/features/orders/components/new-order-page';
import { requireSession } from '@/lib/require-session';

export default async function NewOrder() {
  const session = await requireSession();
  if (!session.currentStore?.canEditOrders)
    return (
      <p role="status" className="p-6">
        You do not have access to create orders in this shop. <Link href="/orders">Back</Link>.
      </p>
    );
  return <NewOrderPage />;
}
