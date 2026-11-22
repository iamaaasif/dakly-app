'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { cn } from '@dakly/ui/cn';

import { useChatContact } from '../api/chat-contact';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { CustomerStatus } from './customer-status';
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
        'min-h-0 min-w-0 flex-col overflow-y-auto border-l border-border',
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
      <div className="space-y-3 p-3">
        {contact.data ? <CustomerStatus kind={contact.data.kind} /> : null}
        <CustomerIdentity conversation={conversation} phone={contact.data?.phone} />
      </div>
      {session?.currentStore?.canEditOrders ? (
        <MakeOrderForm conversation={conversation} contactPhone={contact.data?.phone ?? null} />
      ) : (
        <p className="p-3 text-text-muted">Making an order needs Edit Orders access.</p>
      )}
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
  const name = conversation.contactName ?? 'No name';
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text-muted">
        {initialsOf(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{name}</p>
        {phone === undefined ? null : <p className="text-text-muted">{phone ?? 'No phone yet'}</p>}
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
