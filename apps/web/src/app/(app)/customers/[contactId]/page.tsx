import Link from 'next/link';
import { z } from 'zod';

import { CustomerProfile } from '@/features/customers/components/customer-profile';
import { parseProfileTab } from '@/features/customers/customer-labels';
import { requireSession } from '@/lib/require-session';

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewCustomers)
    return (
      <p role="status" className="p-6">
        You do not have Customers access in this shop.
      </p>
    );
  const parsed = z.uuid().safeParse((await params).contactId);
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This customer address is invalid. <Link href="/customers">Open all customers</Link>.
      </p>
    );
  return (
    <CustomerProfile contactId={parsed.data} tab={parseProfileTab((await searchParams).tab)} />
  );
}
