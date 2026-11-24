'use client';
import { ArrowLeft, Facebook, Instagram, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { Button, buttonVariants } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { contactDisplayName } from '../contact-name';
import {
  useConversation,
  useConversationMessages,
  useMarkConversationRead,
} from '../api/conversation-thread';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { replyWindow } from '../reply-window';
import { ChatComposer } from './chat-composer';
import { ConversationActions } from './conversation-actions';
import { CustomerPanel } from './customer-panel';
import { MessageBubble } from './message-bubble';
import { ResponderBanner } from './responder-banner';
import { useSessionContext } from '@/lib/session-context';

const channelNames: Record<ConversationResponse['channel'], string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

export function ConversationPanel({ query, id }: { query: ChatScreenQuery; id: string }) {
  const conversation = useConversation(id);
  const messages = useConversationMessages(id);
  const markRead = useMarkConversationRead();
  const canEdit = Boolean(useSessionContext().data?.currentStore?.canEditChats);
  const unread = conversation.data?.unreadCount ?? 0;
  const { mutate: read } = markRead;
  useEffect(() => {
    if (unread > 0) read(id);
  }, [id, unread, read]);

  return (
    <>
      <section
        aria-label="Conversation"
        className={cn(
          'min-h-0 min-w-0 flex-col border-l border-border',
          query.panel ? 'hidden xl:flex' : 'flex',
        )}
      >
        <ConversationTopBar query={query} conversation={conversation.data} canEdit={canEdit} />
        {conversation.error ? (
          <div className="p-3">
            <QueryError
              message={conversation.error.message}
              onRetry={() => void conversation.refetch()}
              retryLabel="Retry chat"
            />
          </div>
        ) : (
          <>
            {conversation.data ? (
              <ResponderBanner conversation={conversation.data} canEdit={canEdit} query={query} />
            ) : null}
            <MessageList query={query} id={id} messages={messages} />
            {conversation.data ? <ChatComposer conversation={conversation.data} /> : null}
          </>
        )}
      </section>
      {conversation.data ? <CustomerPanel conversation={conversation.data} query={query} /> : null}
    </>
  );
}

function ConversationTopBar({
  query,
  conversation,
  canEdit,
}: {
  query: ChatScreenQuery;
  conversation: ConversationResponse | undefined;
  canEdit: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
      <Link
        href={chatsHref({ ...query, chat: undefined })}
        aria-label="Back to chats"
        className="inline-flex size-10 items-center justify-center rounded-md hover:bg-surface-muted lg:hidden"
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.75} />
      </Link>
      {conversation ? <ConversationHeader conversation={conversation} /> : null}
      {conversation && canEdit ? (
        <div className="ml-auto">
          <ConversationActions conversation={conversation} />
        </div>
      ) : null}
      <Link
        href={chatsHref({ ...query, panel: 'customer' })}
        className={buttonVariants({
          variant: 'secondary',
          className: 'shrink-0 xl:hidden',
        })}
      >
        Customer
      </Link>
    </div>
  );
}

function ConversationHeader({ conversation }: { conversation: ConversationResponse }) {
  const Icon = { messenger: Facebook, instagram: Instagram, whatsapp: MessageCircle }[
    conversation.channel
  ];
  const window = replyWindow(conversation);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="truncate text-lg font-bold">{contactDisplayName(conversation)}</h2>
        {conversation.channel !== 'whatsapp' ? (
          <Badge variant={window.state === 'open' ? 'warning' : 'neutral'}>
            {window.state === 'open' ? window.label : 'Window over'}
          </Badge>
        ) : null}
      </div>
      <p className="flex items-center gap-1 text-text-muted">
        <Icon aria-hidden="true" size={14} />
        {channelNames[conversation.channel]}
      </p>
    </div>
  );
}

function MessageList({
  messages,
}: {
  query: ChatScreenQuery;
  id: string;
  messages: ReturnType<typeof useConversationMessages>;
}) {
  if (messages.error)
    return (
      <div className="flex-1 p-3">
        <QueryError
          message={messages.error.message}
          onRetry={() => void messages.refetch()}
          retryLabel="Retry messages"
        />
      </div>
    );
  if (messages.isPending)
    return (
      <div aria-busy="true" className="flex-1 space-y-3 p-3">
        <p className="sr-only">Loading messages</p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-10 w-3/5" />
      </div>
    );
  // The API sends the newest first; the thread reads oldest first.
  const items = messages.data.pages.flatMap((page) => page.items).toReversed();
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto p-3">
      {messages.hasNextPage ? (
        <Button
          variant="secondary"
          className="mb-3 self-center"
          disabled={messages.isFetchingNextPage}
          onClick={() => void messages.fetchNextPage()}
        >
          Show earlier messages
        </Button>
      ) : null}
      {items.length ? (
        <ul className="space-y-3">
          {items.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ul>
      ) : (
        <p className="text-center text-text-muted">No messages yet.</p>
      )}
    </div>
  );
}
