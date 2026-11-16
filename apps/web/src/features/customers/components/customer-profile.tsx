'use client';
import Link from 'next/link';

import { ApiError } from '@dakly/ui/api-client';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCustomer } from '../api/customer';
import { channelLabels, customerPhone } from '../customer-labels';
import { CustomerBadges } from './customer-badges';

type CustomerProfileProps = { contactId: string };

export function CustomerProfile({ contactId }: CustomerProfileProps) {
  const customer = useCustomer(contactId);
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <Link href="/customers" className="inline-flex min-h-10 items-center text-action underline">
        All customers
      </Link>
      <ProfileBody customer={customer} />
    </main>
  );
}

type ProfileBodyProps = { customer: ReturnType<typeof useCustomer> };

function ProfileBody({ customer }: ProfileBodyProps) {
  if (customer.error instanceof ApiError && customer.error.code === 'CONTACT_NOT_FOUND')
    return <p>This customer was deleted or is not in this shop.</p>;
  if (customer.error)
    return (
      <QueryError
        message={customer.error.message}
        onRetry={() => void customer.refetch()}
        retryLabel="Retry customer"
      />
    );
  if (customer.isPending)
    return (
      <div role="status" className="space-y-3">
        <p className="sr-only">Loading customer</p>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  const contact = customer.data;
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-xl font-bold">{contact.name ?? 'No name'}</h1>
        <p className="tabular-nums">{customerPhone(contact)}</p>
        <CustomerBadges customer={contact} />
      </header>
      <Card className="space-y-3">
        <h2 className="text-md font-semibold">Chat channels</h2>
        {contact.identities.length ? (
          <ul className="space-y-2">
            {contact.identities.map((identity) => (
              <li key={identity.id}>
                {channelLabels[identity.channel]}: {identity.profileName ?? 'No profile name'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No chat channels yet. They appear when this customer messages the shop.</p>
        )}
      </Card>
    </>
  );
}
