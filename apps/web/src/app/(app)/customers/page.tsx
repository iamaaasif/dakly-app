import Link from 'next/link';

import { contactListQuerySchema } from '@dakly/contracts/contacts';

import { CustomersScreen } from '@/features/customers/components/customers-screen';
import { parseCustomerColumns } from '@/features/customers/customer-columns';
import { requireSession } from '@/lib/require-session';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    kind?: string;
    tag?: string;
    search?: string;
    hasOrdered?: string;
    columns?: string;
  }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewCustomers)
    return (
      <p role="status" className="p-6">
        You do not have Customers access in this shop.
      </p>
    );
  const { cursor, kind, tag, search, hasOrdered, columns } = await searchParams;
  const parsed = contactListQuerySchema.safeParse({ cursor, kind, tag, search, hasOrdered });
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This customers page address is invalid. <Link href="/customers">Open all customers</Link>.
      </p>
    );
  return <CustomersScreen query={parsed.data} columns={parseCustomerColumns(columns)} />;
}
