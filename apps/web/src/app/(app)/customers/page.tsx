import { contactListQuerySchema } from '@dakly/contracts/contacts';

import { CustomersScreen } from '@/features/customers/components/customers-screen';
import { requireSession } from '@/lib/require-session';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; kind?: string; tag?: string; search?: string }>;
}) {
  const session = await requireSession();
  if (!session.currentStore?.canViewCustomers)
    return (
      <p role="status" className="p-6">
        You do not have Customers access in this shop.
      </p>
    );
  const { cursor, kind, tag, search } = await searchParams;
  const parsed = contactListQuerySchema.safeParse({ cursor, kind, tag, search });
  if (!parsed.success)
    return (
      <p role="alert" className="p-6">
        This customers page address is invalid. <a href="/customers">Open all customers</a>.
      </p>
    );
  return <CustomersScreen query={parsed.data} />;
}
