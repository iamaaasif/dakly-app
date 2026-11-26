'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { cn } from '@dakly/ui/cn';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useChatContact } from '../api/chat-contact';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { contactDisplayName } from '../contact-name';
import { CustomerStatus } from './customer-status';
import { DeliveryHistory } from './delivery-history';
import { MakeOrderForm } from './make-order-form';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

export function CustomerPanel({
  conversation,
  query,
}: {
  conversation: ConversationResponse;
  query: ChatScreenQuery;
}) {
  const { data: session } = useSessionContext();
  const contact = useChatContact(conversation.contactId);
  return (
    <aside
      aria-label="Customer"
      className={cn(
        'col-start-1 row-start-2 min-h-0 min-w-0 flex-col overflow-y-auto border-border bg-surface lg:col-start-2 lg:border-l xl:col-start-3 xl:row-span-2 xl:row-start-1',
        query.panel ? 'flex' : 'hidden xl:flex',
      )}
    >
      <Link
        href={chatsHref({ ...query, panel: undefined })}
        className="flex min-h-10 items-center gap-2 px-3 text-text-muted xl:hidden"
      >
        <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
        Back to chat
      </Link>
      <div className="space-y-3 p-4">
        {contact.data ? <CustomerStatus kind={contact.data.kind} /> : null}
        <CustomerIdentity conversation={conversation} phone={contact.data?.phone} />
        <DeliveryHistory contactId={conversation.contactId} />
      </div>
      <Tabs defaultValue="order">
        <TabsList className="border-t border-border px-4">
          <TabsTrigger value="order">Order</TabsTrigger>
          <TabsTrigger value="media" disabled>
            Media
          </TabsTrigger>
          <TabsTrigger value="ask" disabled>
            Ask Dakly
          </TabsTrigger>
        </TabsList>
        <TabsContent value="order" className="pt-0">
          {session?.currentStore?.canEditOrders ? (
            <MakeOrderForm conversation={conversation} contactPhone={contact.data?.phone ?? null} />
          ) : (
            <p className="p-3 text-text-muted">Making an order needs Edit Orders access.</p>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function CustomerIdentity({
  conversation,
  phone,
}: {
  conversation: ConversationResponse;
  phone: string | null | undefined;
}) {
  const { data: session } = useSessionContext();
  const name = contactDisplayName(conversation);
  return (
    <div className="flex items-center gap-3">
      <span className="border-inbox-avatar-border bg-inbox-avatar text-inbox-avatar-text flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
        {initialsOf(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        {phone === undefined ? null : (
          <p className="truncate text-sm text-text-muted">{phone ?? 'No phone yet'}</p>
        )}
      </div>
      {session?.currentStore?.canViewCustomers ? (
        <Link
          href={`/customers/${conversation.contactId}`}
          className="ml-auto shrink-0 text-action underline"
        >
          Open profile
        </Link>
      ) : null}
    </div>
  );
}
