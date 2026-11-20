'use client';
import { ArrowLeft, Clock, MessageCircle, MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';

import type { ContactDetailResponse, ContactResponse } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useCustomer } from '../api/customer';
import { channelLabels, customerKindLabels, customerPhone } from '../customer-labels';
import { ConsentForm } from './consent-form';
import { CustomerActions } from './customer-actions';
import { CustomerBadges } from './customer-badges';
import { formatDate } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

type CustomerProfileProps = { contactId: string };

const profileTabs = [
  'Overview',
  'Orders',
  'Activity',
  'Campaign history',
  'Notes',
  'Marketing preferences',
] as const;
const kpis = [
  'Total spending',
  'Orders',
  'Average order value',
  'Last purchase',
  'First purchase',
  'Lifetime value',
] as const;
const followUpChannels = ['Call', 'WhatsApp', 'SMS'] as const;
const followUpTimes = ['Tomorrow', 'In 3 days', 'In 1 week'] as const;
const quickActions = [
  [Phone, 'Call'],
  [MessageCircle, 'WhatsApp'],
  [MessageSquare, 'SMS'],
] as const;

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
      <ProfileStats />
      <div className="grid gap-6 lg:grid-cols-3">
        <ProfileContent contact={contact} canEdit={canEdit} />
        <ProfileSidebar contact={contact} />
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
          {initialsOf(contact.name ?? 'Customer')}
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{contact.name ?? 'No name'}</h1>
            <CustomerBadges customer={contact} />
          </div>
          <p className="text-sm text-text-muted tabular-nums">
            {`${customerPhone(contact)} · Customer since ${formatDate(contact.createdAt, new Date().toISOString())}`}
          </p>
        </div>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <CustomerActions customer={contact} />
          <Button variant="primary" disabled aria-disabled="true">
            Create campaign
          </Button>
        </div>
      ) : null}
    </header>
  );
}

function ProfileStats() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((label) => (
        <Card key={label} className="space-y-1 p-3">
          <p className="text-xs text-text-muted">{label}</p>
          <p className="text-lg font-bold tabular-nums">—</p>
        </Card>
      ))}
    </div>
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
      <div className="flex overflow-x-auto border-b border-border text-sm">
        {profileTabs.map((tab, i) => (
          <button
            key={tab}
            type="button"
            disabled={i > 0}
            className={
              i === 0
                ? 'min-h-10 border-b-2 border-action px-4 py-2 font-medium text-action'
                : 'min-h-10 cursor-not-allowed px-4 py-2 text-text-muted'
            }
          >
            {tab}
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {customerDetails(contact).map(([label, val, cls]) => (
            <div key={label}>
              <p className="text-xs text-text-muted">{label}</p>
              <p className={cls}>{val}</p>
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

function ProfileSidebar({ contact }: { contact: ContactResponse }) {
  return (
    <div className="space-y-6">
      <ProfileContactCard contact={contact} />
      <ProfileFollowUpCard />
      <ProfileSegmentsCard contact={contact} />
    </div>
  );
}

function ProfileContactCard({ contact }: { contact: ContactResponse }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-md font-semibold">Contact {contact.name?.split(' ')[0] ?? 'customer'}</h2>
      <p className="text-xs text-text-muted tabular-nums">
        Direct contact: {customerPhone(contact)}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {quickActions.map(([Icon, label]) => (
          <Button
            key={label}
            variant="secondary"
            className="flex flex-col items-center gap-1 py-3 text-xs"
            disabled
          >
            <Icon aria-hidden="true" size={16} /> {label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ProfileFollowUpCard() {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Clock aria-hidden="true" size={16} /> <span>Follow-up</span>
      </div>
      <div className="flex gap-1.5">
        {followUpChannels.map((c, i) => (
          <span
            key={c}
            className={
              i === 0
                ? 'rounded bg-text px-2.5 py-1 text-xs font-medium text-surface'
                : 'rounded border border-border px-2.5 py-1 text-xs text-text-muted'
            }
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 pt-1">
        {followUpTimes.map((t) => (
          <span key={t} className="rounded border border-border px-2.5 py-1 text-xs">
            {t}
          </span>
        ))}
      </div>
    </Card>
  );
}

function ProfileSegmentsCard({ contact }: { contact: ContactResponse }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-md font-semibold">Segments & tags</h2>
      {contact.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-action/30 bg-primary-soft px-2.5 py-0.5 text-xs text-action"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-muted">No tags added yet</p>
      )}
      <Input
        aria-label="Add tag"
        placeholder="Add a tag and press Enter"
        disabled
        className="text-xs"
      />
    </Card>
  );
}

function customerDetails(contact: ContactResponse) {
  return [
    ['Phone', customerPhone(contact), 'tabular-nums font-medium'],
    ['Email', 'Not added', 'font-medium'],
    ['Address', 'Not added', 'font-medium'],
    ['Customer type', customerKindLabels[contact.kind], 'font-medium capitalize'],
    ['Favourite category', '—', 'font-medium'],
    [
      'Customer since',
      formatDate(contact.createdAt, new Date().toISOString()),
      'tabular-nums font-medium',
    ],
  ] as const;
}
