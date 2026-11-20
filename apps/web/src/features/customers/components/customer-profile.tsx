'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import type { ContactDetailResponse, ContactResponse } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { Badge } from '@dakly/ui/badge';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCustomer } from '../api/customer';
import { channelLabels, customerKindLabels, customerPhone } from '../customer-labels';
import { ConsentForm } from './consent-form';
import { CustomerActions } from './customer-actions';
import { formatCalendarDate } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

type CustomerProfileProps = { contactId: string };

export function CustomerProfile({ contactId }: CustomerProfileProps) {
  const customer = useCustomer(contactId);
  const { data: context } = useSessionContext();
  return (
    <main className="space-y-6 p-4 md:p-8">
      <Link
        href="/customers"
        className="inline-flex min-h-10 items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft aria-hidden="true" size={16} /> All customers
      </Link>
      <ProfileBody
        customer={customer}
        canEdit={Boolean(context?.currentStore?.canCreateCustomer)}
      />
    </main>
  );
}

function ProfileBody({
  customer,
  canEdit,
}: {
  customer: ReturnType<typeof useCustomer>;
  canEdit: boolean;
}) {
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
    <div className="space-y-6">
      <ProfileHeader contact={contact} canEdit={canEdit} />
      <div className="grid gap-6 lg:grid-cols-3">
        <ProfileContent contact={contact} canEdit={canEdit} />
        <ProfileSegmentsCard contact={contact} />
      </div>
    </div>
  );
}

function ProfileHeader({ contact, canEdit }: { contact: ContactDetailResponse; canEdit: boolean }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-action"
        >
          {initialsOf(contact.name ?? 'No name')}
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{contact.name ?? 'No name'}</h1>
            <Badge variant={contact.kind === 'customer' ? 'neutral' : 'info'}>
              {customerKindLabels[contact.kind]}
            </Badge>
          </div>
          <p className="text-sm text-text-muted tabular-nums">{customerPhone(contact)}</p>
        </div>
      </div>
      {canEdit ? <CustomerActions customer={contact} /> : null}
    </header>
  );
}

function ProfileContent({
  contact,
  canEdit,
}: {
  contact: ContactDetailResponse;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6 lg:col-span-2">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {customerDetails(contact).map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-text-muted">{label}</p>
              <p className="font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-md font-semibold">Chat channels</h2>
        {contact.identities.length ? (
          <ul className="space-y-2">
            {contact.identities.map((identity) => (
              <li key={identity.id} className="text-sm">
                {channelLabels[identity.channel]}: {identity.profileName ?? 'No profile name'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">
            No chat channels yet. They appear when this customer messages the shop.
          </p>
        )}
      </Card>

      {canEdit ? <ConsentForm contactId={contact.id} /> : null}
    </div>
  );
}

function ProfileSegmentsCard({ contact }: { contact: ContactResponse }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-md font-semibold">Segments & tags</h2>
      {contact.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.map((tag) => (
            <Badge key={tag} variant="info">
              {tag}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No tags added yet</p>
      )}
    </Card>
  );
}

function customerDetails(contact: ContactResponse) {
  return [
    { label: 'Customer type', value: customerKindLabels[contact.kind] },
    { label: 'Customer since', value: formatCalendarDate(contact.createdAt, 'Asia/Dhaka') },
  ];
}
