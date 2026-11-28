'use client';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useConversations } from '../api/conversations';
import { conversationFilters, type ChatScreenQuery } from '../chat-filters';
import { AiNotLiveBanner } from './ai-not-live-banner';
import { ChatRow } from './chat-row';
import { ChatSearchBar } from './chat-search-bar';

export function ChatList({ query }: { query: ChatScreenQuery }) {
  return (
    <section
      aria-label="Chat list"
      className={cn(
        'col-start-1 row-start-2 min-h-0 min-w-0 flex-col',
        query.chat ? 'hidden lg:flex' : 'flex',
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-3">
        <ChatSearchBar query={query} />
      </div>
      <AiNotLiveBanner query={query} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChatRows query={query} />
      </div>
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
  if (!items.length)
    return (
      <p className="p-4 text-text-muted">
        {query.q || query.assignee || query.label ? 'No chats match.' : 'No chats here yet.'}
      </p>
    );
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((conversation) => (
          <ChatRow key={conversation.id} conversation={conversation} query={query} />
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
