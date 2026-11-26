'use client';
import { ArrowUpDown, ListFilter, MessageSquare, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useConversationAssignees, useConversationLabels } from '../api/conversations';
import {
  chatSortLabels,
  chatSorts,
  chatTabLabels,
  chatTabs,
  chatsHref,
  type ChatScreenQuery,
} from '../chat-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlRouter } from '@/lib/use-url-query';

const anyone = 'anyone';
const anyLabel = 'any-label';

export function ChatSearchBar({ query }: { query: ChatScreenQuery }) {
  const router = useUrlRouter();
  const [words, setWords] = useState(query.q ?? '');
  const settled = useDebouncedValue(words.trim(), 300);

  useEffect(() => {
    if (settled === (query.q ?? '')) return;
    router.replace(chatsHref({ ...query, q: settled || undefined }));
  }, [settled, query, router]);

  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
        <Search aria-hidden="true" size={16} />
      </span>
      <Input
        type="search"
        aria-label="Search chats"
        placeholder="Search name or phone"
        maxLength={120}
        value={words}
        onChange={(event) => setWords(event.target.value)}
        className="bg-surface-muted pl-9"
      />
    </div>
  );
}

type ChatToolbarProps = { query: ChatScreenQuery; foldersOpen: boolean; channel: ReactNode };

export function ChatToolbar({ query, foldersOpen, channel }: ChatToolbarProps) {
  const router = useUrlRouter();
  return (
    <>
      <ChatFolderSelect query={query} foldersOpen={foldersOpen} />
      <Select
        value={query.sort}
        onValueChange={(sort) =>
          router.replace(chatsHref({ ...query, sort: sort as ChatScreenQuery['sort'] }))
        }
      >
        <SelectTrigger aria-label="Sort chats" className="w-auto">
          <ArrowUpDown aria-hidden="true" size={16} />
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
      {channel}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            <ListFilter aria-hidden="true" size={16} />
            Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Filter chats">
          <ChatFilterPanel query={query} />
        </PopoverContent>
      </Popover>
    </>
  );
}

// The folder column replaces this picker when it is open; phones always pick the folder here.
function ChatFolderSelect({
  query,
  foldersOpen,
}: {
  query: ChatScreenQuery;
  foldersOpen: boolean;
}) {
  const router = useUrlRouter();
  return (
    <Select
      value={query.tab}
      onValueChange={(tab) =>
        router.push(
          chatsHref({
            ...query,
            tab: tab as ChatScreenQuery['tab'],
            channel: query.channel === 'comments' ? undefined : query.channel,
            chat: undefined,
            panel: undefined,
            post: undefined,
          }),
        )
      }
    >
      <SelectTrigger aria-label="Chat folder" className={cn('w-auto', foldersOpen && 'lg:hidden')}>
        <MessageSquare aria-hidden="true" size={16} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {chatTabs.map((tab) => (
          <SelectItem key={tab} value={tab}>
            {tab === 'all' ? 'All chats' : chatTabLabels[tab]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChatFilterPanel({ query }: { query: ChatScreenQuery }) {
  const router = useUrlRouter();
  const assignees = useConversationAssignees();
  return (
    <div className="space-y-3">
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
      <LabelFilter query={query} />
      <div className="flex items-center justify-between">
        <Button
          variant="link"
          className="text-text-muted"
          disabled={!query.assignee && !query.label}
          onClick={() =>
            router.replace(chatsHref({ ...query, assignee: undefined, label: undefined }))
          }
        >
          Clear
        </Button>
        <PopoverClose asChild>
          <Button className="bg-inverse text-on-primary hover:bg-inverse/90">Done</Button>
        </PopoverClose>
      </div>
    </div>
  );
}

function LabelFilter({ query }: { query: ChatScreenQuery }) {
  const router = useUrlRouter();
  const labels = useConversationLabels();
  return (
    <div className="space-y-1">
      <p id="chat-label-label" className="text-sm font-semibold">
        Label
      </p>
      <Select
        value={query.label ?? anyLabel}
        onValueChange={(label) =>
          router.replace(chatsHref({ ...query, label: label === anyLabel ? undefined : label }))
        }
      >
        <SelectTrigger aria-labelledby="chat-label-label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={anyLabel}>Any label</SelectItem>
          {labels.data?.map((label) => (
            <SelectItem key={label} value={label}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
