'use client';
import { BookUser, Plus } from 'lucide-react';
import { useState } from 'react';

import type { ContactCountsResponse } from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';
import { ApiError } from '@dakly/ui/api-client';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { EmptyState } from '@dakly/ui/empty-state';
import { PageHeader } from '@dakly/ui/page-header';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { TableCard } from '@dakly/ui/table';

import { useContactCounts } from '../api/contact-counts';
import { useContactTags } from '../api/contact-tags';
import { useCustomers } from '../api/customers';
import {
  type ContactsScreenState,
  contactsHref,
  hasContactFilters,
  parseContactsAddress,
} from '../contacts-query';
import type { ListHref } from '../customers-query';
import { type AddingContacts, AddContactsDialogs } from './add-contacts-flow';
import { ContactTabs } from './contact-tabs';
import { ContactToolbar } from './contact-toolbar';
import { CustomerFooter } from './customer-footer';
import { CustomerList } from './customer-list';
import { Refreshing } from '@/components/refreshing';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery } from '@/lib/use-url-query';

export function ContactsScreen(initial: ContactsScreenState) {
  const { query, columns } = useUrlQuery(initial, (raw) => parseContactsAddress(raw));
  const contacts = useCustomers(query);
  const counts = useContactCounts();
  const [adding, setAdding] = useState<AddingContacts>(null);
  const [added, setAdded] = useState(false);
  const { data: context } = useSessionContext();
  const hrefFor: ListHref = (chosen, change) => contactsHref(query, chosen, change);
  const addButton = context?.currentStore?.canCreateCustomer ? (
    <Button onClick={() => setAdding('choose')} className="gap-2">
      <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add contact
    </Button>
  ) : undefined;
  const noContactsAtAll =
    contacts.data?.total === 0 && !hasContactFilters(query) && !contacts.isPlaceholderData;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <PageHeader
        title="All contacts"
        description={counts.data ? countsLine(counts.data) : undefined}
        actions={
          <>
            {added ? (
              <p role="status">
                <Badge variant="success">Contact added</Badge>
              </p>
            ) : null}
            {addButton}
          </>
        }
      />
      <TableCard className="motion-enter">
        {noContactsAtAll ? (
          <EmptyState
            icon={BookUser}
            title="You don't have any contact yet"
            description="Once you add contacts, they show here."
            action={addButton}
            className="py-24"
          />
        ) : (
          <ContactsTable
            contacts={contacts}
            counts={counts.data}
            query={query}
            columns={columns}
            hrefFor={hrefFor}
            onImport={() => setAdding('import')}
          />
        )}
      </TableCard>
      <AddContactsDialogs adding={adding} onAdding={setAdding} onAdded={() => setAdded(true)} />
    </main>
  );
}

function countsLine(counts: ContactCountsResponse) {
  return `${formatCount(counts.all)} contacts · ${formatCount(counts.boughtMoreThanOnce)} bought more than once · ${formatCount(counts.canReceiveMarketing)} can receive marketing messages`;
}

type ContactsTableProps = ContactResultsProps & {
  counts: ContactCountsResponse | undefined;
  hrefFor: ListHref;
  onImport: () => void;
};

function ContactsTable({
  contacts,
  counts,
  query,
  columns,
  hrefFor,
  onImport,
}: ContactsTableProps) {
  const searchError =
    contacts.error instanceof ApiError && contacts.error.code === 'CONTACT_SEARCH_TOO_SHORT'
      ? contacts.error.message
      : undefined;
  const tags = useContactTags().data ?? [];
  return (
    <>
      <ContactTabs query={query} columns={columns} counts={counts} hrefFor={hrefFor} />
      <ContactToolbar
        key={`${query.search ?? ''}`}
        query={query}
        columns={columns}
        hrefFor={hrefFor}
        tags={tags}
        searchError={searchError}
        onImport={onImport}
      />
      {searchError ? null : <ContactResults contacts={contacts} query={query} columns={columns} />}
    </>
  );
}

type ContactResultsProps = {
  contacts: ReturnType<typeof useCustomers>;
  query: ContactsScreenState['query'];
  columns: ContactsScreenState['columns'];
};

function ContactResults({ contacts, query, columns }: ContactResultsProps) {
  if (contacts.error)
    return (
      <div className="p-4">
        <QueryError
          message={contacts.error.message}
          onRetry={() => void contacts.refetch()}
          retryLabel="Retry contacts"
        />
      </div>
    );
  if (contacts.isPending || !contacts.data)
    return (
      <div aria-busy="true" className="space-y-3 p-4">
        <p className="sr-only">Loading contacts</p>
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  const { items, nextCursor, total } = contacts.data;
  if (!items.length)
    return (
      <EmptyState
        icon={BookUser}
        title="No contacts match"
        description={query.search ? 'Try a full mobile number or 3 letters of a name.' : undefined}
      />
    );
  return (
    <Refreshing active={contacts.isPlaceholderData}>
      <CustomerList customers={items} columns={columns} withOrders={false} />
      <CustomerFooter
        shown={items.length}
        total={total}
        noun="contacts"
        firstHref={query.cursor ? contactsHref(query, columns) : undefined}
        nextHref={nextCursor ? contactsHref(query, columns, { cursor: nextCursor }) : undefined}
      />
    </Refreshing>
  );
}
