'use client';
import { Filter, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useConversationAssignees } from '../api/conversations';
import { chatSortLabels, chatSorts, chatsHref, type ChatScreenQuery } from '../chat-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const anyone = 'anyone';

export function ChatSearchBar({ query }: { query: ChatScreenQuery }) {
  const router = useRouter();
  const [words, setWords] = useState(query.q ?? '');
  const settled = useDebouncedValue(words.trim(), 300);
  const [filterOpen, setFilterOpen] = useState(Boolean(query.assignee));

  useEffect(() => {
    if (settled === (query.q ?? '')) return;
    router.replace(chatsHref({ ...query, q: settled || undefined }));
  }, [settled, query, router]);

  return (
    <div className="shrink-0 space-y-2 border-b border-border p-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          type="search"
          aria-label="Search chats"
          placeholder="Search name or phone"
          maxLength={120}
          value={words}
          onChange={(event) => setWords(event.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
        >
          <Filter aria-hidden="true" size={16} strokeWidth={1.75} />
          Filter
        </Button>
        <Select
          value={query.sort}
          onValueChange={(sort) =>
            router.replace(chatsHref({ ...query, sort: sort as ChatScreenQuery['sort'] }))
          }
        >
          <SelectTrigger aria-label="Sort chats">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {chatSorts.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {chatSortLabels[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filterOpen ? <ChatFilterPanel query={query} /> : null}
    </div>
  );
}

function ChatFilterPanel({ query }: { query: ChatScreenQuery }) {
  const router = useRouter();
  const assignees = useConversationAssignees();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="space-y-1">
        <p id="chat-assignee-label" className="text-sm font-semibold">
          Assigned to
        </p>
        <Select
          value={query.assignee ?? anyone}
          onValueChange={(assignee) =>
            router.replace(
              chatsHref({ ...query, assignee: assignee === anyone ? undefined : assignee }),
            )
          }
        >
          <SelectTrigger aria-labelledby="chat-assignee-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={anyone}>Anyone</SelectItem>
            {assignees.data?.map((assignee) => (
              <SelectItem key={assignee.userId} value={assignee.userId}>
                {assignee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="secondary"
        disabled={!query.assignee}
        onClick={() => router.replace(chatsHref({ ...query, assignee: undefined }))}
      >
        Clear
      </Button>
    </div>
  );
}
