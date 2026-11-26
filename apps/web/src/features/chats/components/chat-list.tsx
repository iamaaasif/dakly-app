'use client';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useConversations } from '../api/conversations';
import { conversationFilters, type ChatScreenQuery } from '../chat-filters';
import { ChatBulkBar } from './chat-bulk-bar';
import { ChatRow } from './chat-row';
import { ChatSearchBar } from './chat-search-bar';
import { useSessionContext } from '@/lib/session-context';

export function ChatList({ query }: { query: ChatScreenQuery }) {
  const canEdit = Boolean(useSessionContext().data?.currentStore?.canEditChats);
  // Picking chats is screen state: it is not worth a link and it ends when the person leaves.
  const [selected, setSelected] = useState<string[] | null>(null);
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
        {canEdit && !selected ? (
          <Button
            variant="secondary"
            aria-label="Select chats"
            title="Select chats"
            className="shrink-0 p-0"
            onClick={() => setSelected([])}
          >
            <ListChecks aria-hidden="true" size={16} />
          </Button>
        ) : null}
      </div>
      {selected ? <ChatBulkBar selected={selected} onDone={() => setSelected(null)} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ChatRows query={query} selected={selected} onSelect={setSelected} />
      </div>
    </section>
  );
}

type ChatRowsProps = {
  query: ChatScreenQuery;
  selected: string[] | null;
  onSelect: (selected: string[]) => void;
};

function ChatRows({ query, selected, onSelect }: ChatRowsProps) {
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
          <ChatRow
            key={conversation.id}
            conversation={conversation}
            query={query}
            selection={selectionFor(conversation.id, selected, onSelect)}
          />
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

function selectionFor(
  id: string,
  selected: string[] | null,
  onSelect: (selected: string[]) => void,
) {
  if (!selected) return undefined;
  const isSelected = selected.includes(id);
  return {
    selected: isSelected,
    onToggle: () =>
      onSelect(isSelected ? selected.filter((other) => other !== id) : [...selected, id]),
  };
}
