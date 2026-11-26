'use client';
import { ArrowLeft, Facebook, Instagram, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { type UIEvent, useEffect, useLayoutEffect, useRef } from 'react';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { Button, buttonVariants } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import {
  useConversation,
  useConversationMessages,
  useMarkConversationRead,
} from '../api/conversation-thread';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { contactDisplayName } from '../contact-name';
import { replyWindow } from '../reply-window';
import { ChatComposer } from './chat-composer';
import { ConversationActions } from './conversation-actions';
import { CustomerPanel } from './customer-panel';
import { MessageBubble } from './message-bubble';
import { ResponderBanner } from './responder-banner';
import { initialsOf } from '@/lib/initials';
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
          'col-start-1 row-start-2 min-h-0 min-w-0 flex-col border-border bg-surface-muted lg:col-start-2 lg:border-l',
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
            <MessageList panel={query.panel} messages={messages} />
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
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <Link
        href={chatsHref({ ...query, chat: undefined })}
        aria-label="Back to chats"
        className="inline-flex size-10 items-center justify-center rounded-md hover:bg-surface-muted lg:hidden"
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.75} />
      </Link>
      {conversation ? <ConversationHeader conversation={conversation} /> : null}
      {conversation && canEdit ? (
        <div className="order-last ml-auto min-w-0 basis-full xl:order-none xl:basis-auto">
          <ConversationActions conversation={conversation} />
        </div>
      ) : null}
      <Link
        href={chatsHref({ ...query, panel: 'customer' })}
        className={buttonVariants({
          variant: 'secondary',
          size: 'sm',
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
  const name = contactDisplayName(conversation);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-text-muted"
      >
        {initialsOf(name)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          {conversation.channel === 'whatsapp' ? null : (
            <Badge variant={window.state === 'open' ? 'warning' : 'neutral'}>
              {window.state === 'open' ? window.label : 'Window over'}
            </Badge>
          )}
        </div>
        <p className="flex items-center gap-1 text-xs text-text-muted">
          <Icon aria-hidden="true" size={14} />
          {channelNames[conversation.channel]}
        </p>
      </div>
    </div>
  );
}

function MessageList({
  panel,
  messages,
}: {
  panel: ChatScreenQuery['panel'];
  messages: ReturnType<typeof useConversationMessages>;
}) {
  if (messages.isError && !messages.data)
    return (
      <div className="flex-1 p-3">
        <QueryError
          message={messages.error.message}
          onRetry={() => void messages.refetch()}
          retryLabel="Retry messages"
        />
      </div>
    );
  if (!messages.data)
    return (
      <div aria-busy="true" className="flex-1 space-y-3 p-3">
        <p className="sr-only">Loading messages</p>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-10 w-3/5" />
      </div>
    );

  return <MessageHistory panel={panel} messages={messages} />;
}

function MessageHistory({
  panel,
  messages,
}: {
  panel: ChatScreenQuery['panel'];
  messages: ReturnType<typeof useConversationMessages>;
}) {
  const { viewport, onScroll, loadEarlier } = useMessageScroll(messages, panel);
  const items = messages.data?.pages.flatMap((page) => page.items).toReversed() ?? [];

  return (
    <div
      ref={viewport}
      role="region"
      aria-label="Message history"
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 [overflow-anchor:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      onScroll={onScroll}
    >
      {messages.hasNextPage ? (
        <Button
          variant="secondary"
          className="mb-3 shrink-0 self-center"
          disabled={messages.isFetchingNextPage}
          onClick={loadEarlier}
        >
          {messages.isFetchNextPageError ? 'Retry earlier messages' : 'Show earlier messages'}
        </Button>
      ) : null}
      {items.length ? (
        <ul className="mt-auto space-y-4">
          {items.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ul>
      ) : (
        <p className="mt-auto text-center text-text-muted">No messages yet.</p>
      )}
    </div>
  );
}

function useMessageScroll(
  messages: ReturnType<typeof useConversationMessages>,
  panel: ChatScreenQuery['panel'],
) {
  const viewport = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const anchor = useRef<{ top: number; height: number; pageCount: number } | null>(null);
  const pageCount = messages.data?.pages.length ?? 0;

  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view || !view.clientHeight) return;
    const previous = anchor.current;
    if (previous && pageCount > previous.pageCount) {
      view.scrollTop = previous.top + view.scrollHeight - previous.height;
      anchor.current = null;
    } else if (!previous && pinned.current) {
      view.scrollTop = view.scrollHeight;
    }
  }, [messages.data, pageCount, panel]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const { scrollHeight, clientHeight, scrollTop } = event.currentTarget;
    pinned.current = scrollHeight - clientHeight - scrollTop < 48;
  }

  function loadEarlier() {
    const view = viewport.current;
    if (view) anchor.current = { top: view.scrollTop, height: view.scrollHeight, pageCount };
    void messages.fetchNextPage().then((result) => {
      if (result.isError) anchor.current = null;
    });
  }

  return { viewport, onScroll, loadEarlier };
}
