'use client';
import { ArrowUpDown, Inbox, MessageSquare, Plus, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { conversationFolders, conversationStates } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';

import { useConversationAssignees, useConversationLabels } from '../api/conversations';
import {
  chatFolderLabels,
  chatSortLabels,
  chatSorts,
  chatStateLabels,
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
        placeholder="Search name or phone…"
        maxLength={120}
        value={words}
        onChange={(event) => setWords(event.target.value)}
        className="bg-surface-muted pl-9"
      />
    </div>
  );
}

// Toolbar pickers match the compact secondary buttons beside them.
const toolbarSelect = 'min-h-9 w-auto px-2.5 py-1 text-sm';

type ChatToolbarProps = { query: ChatScreenQuery; foldersOpen: boolean; channel: ReactNode };

export function ChatToolbar({ query, foldersOpen, channel }: ChatToolbarProps) {
  const router = useUrlRouter();
  return (
    <>
      <ChatFolderSelect query={query} foldersOpen={foldersOpen} />
      <ChatStateSelect query={query} />
      <Select
        value={query.sort}
        onValueChange={(sort) =>
          router.replace(chatsHref({ ...query, sort: sort as ChatScreenQuery['sort'] }))
        }
      >
        <SelectTrigger aria-label="Sort chats" className={toolbarSelect}>
          <ArrowUpDown aria-hidden="true" size={16} />
          <span>
            Sort: <SelectValue />
          </span>
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
            <Plus aria-hidden="true" size={16} />
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
      value={query.folder}
      onValueChange={(folder) =>
        router.push(
          chatsHref({
            ...query,
            folder: folder as ChatScreenQuery['folder'],
            channel: query.channel === 'comments' ? undefined : query.channel,
            chat: undefined,
            panel: undefined,
            post: undefined,
          }),
        )
      }
    >
      <SelectTrigger
        aria-label="Chat folder"
        className={cn(toolbarSelect, foldersOpen && 'lg:hidden')}
      >
        <Inbox aria-hidden="true" size={16} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {conversationFolders.map((folder) => (
          <SelectItem key={folder} value={folder}>
            {chatFolderLabels[folder]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChatStateSelect({ query }: { query: ChatScreenQuery }) {
  const router = useUrlRouter();
  return (
    <Select
      value={query.state}
      onValueChange={(state) =>
        router.push(
          chatsHref({ ...query, state: state as ChatScreenQuery['state'], chat: undefined }),
        )
      }
    >
      <SelectTrigger aria-label="Chat state" className={toolbarSelect}>
        <MessageSquare aria-hidden="true" size={16} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {conversationStates.map((state) => (
          <SelectItem key={state} value={state}>
            {chatStateLabels[state]}
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
