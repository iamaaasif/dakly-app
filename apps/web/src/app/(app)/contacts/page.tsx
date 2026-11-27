import Link from 'next/link';

import { ContactsScreen } from '@/features/customers/components/contacts-screen';
import { parseContactsAddress } from '@/features/customers/contacts-query';
import { requireSession } from '@/lib/require-session';

export default async function ContactsPage({
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
  const state = parseContactsAddress(await searchParams);
  if (!state)
    return (
      <p role="alert" className="p-6">
        This contacts page address is invalid. <Link href="/contacts">Open all contacts</Link>.
      </p>
    );
  return <ContactsScreen {...state} />;
}
