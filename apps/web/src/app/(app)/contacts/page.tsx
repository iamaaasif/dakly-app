import { PageHeader } from '@dakly/ui/page-header';

import { AddContactsFlow } from '@/features/customers/components/add-contacts-flow';
import { requireSession } from '@/lib/require-session';

// DSN-21 builds the list on this page; until then it holds the Add and Import flows.
export default async function ContactsPage() {
  const session = await requireSession();
  if (!session.currentStore?.canViewCustomers)
    return (
      <p role="status" className="p-6">
        You do not have Customers access in this shop.
      </p>
    );
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <PageHeader title="All contacts" actions={<AddContactsFlow />} />
    </main>
  );
}
