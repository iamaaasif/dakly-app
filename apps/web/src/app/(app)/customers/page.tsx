import Link from 'next/link';

import { CustomersScreen } from '@/features/customers/components/customers-screen';
import { parseCustomersAddress } from '@/features/customers/customers-query';
import { requireSession } from '@/lib/require-session';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewCustomers)
    return (
      <p role="status" className="p-6">
        You do not have Customers access in this shop.
      </p>
    );
  const state = parseCustomersAddress(await searchParams);
  if (!state)
    return (
      <p role="alert" className="p-6">
        This customers page address is invalid. <Link href="/customers">Open all customers</Link>.
      </p>
    );
  return <CustomersScreen {...state} />;
}
