'use client';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useConversationCounts, useConversations } from '../api/conversations';
import { conversationFilters, type ChatScreenQuery } from '../chat-filters';
import { ChatChannelFilter } from './chat-channel-filter';
import { ChatRow } from './chat-row';
import { ChatTabs } from './chat-tabs';

export function ChatList({ query }: { query: ChatScreenQuery }) {
  const counts = useConversationCounts();
  return (
    <section aria-label="Chat list" className="flex min-w-0 flex-col">
      <ChatTabs query={query} counts={counts.data} />
      <div className="border-b border-border p-3">
        <ChatChannelFilter query={query} />
      </div>
      <ChatRows query={query} />
    </section>
  );
}

function ChatRows({ query }: { query: ChatScreenQuery }) {
  const conversations = useConversations(conversationFilters(query));
  if (conversations.error)
    return (
      <div className="p-3">
        <QueryError
          message={conversations.error.message}
          onRetry={() => void conversations.refetch()}
          retryLabel="Retry chats"
        />
      </div>
    );
  if (conversations.isPending)
    return (
      <div aria-busy="true" className="space-y-2 p-3">
        <p className="sr-only">Loading chats</p>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  const items = conversations.data.pages.flatMap((page) => page.items);
  if (!items.length) return <p className="p-4 text-text-muted">No chats here yet.</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((conversation) => (
          <ChatRow key={conversation.id} conversation={conversation} />
        ))}
      </ul>
      {conversations.hasNextPage ? (
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            disabled={conversations.isFetchingNextPage}
            onClick={() => void conversations.fetchNextPage()}
          >
            Show more chats
          </Button>
        </div>
      ) : null}
    </>
  );
}
