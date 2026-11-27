'use client';
import { ArrowUpDown, Inbox, MessageSquare, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { conversationFolders, conversationStates } from '@dakly/contracts/chats';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@dakly/ui/select';
import { Sheet } from '@dakly/ui/sheet';

import { useConversationAssignees, useConversationLabels } from '../api/conversations';
import {
  chatFolderLabels,
  chatSortLabels,
  chatSorts,
  chatStateLabels,
  chatsHref,
  type ChatScreenQuery,
} from '../chat-filters';
import { ChatChannelFilter } from './chat-channel-filter';
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
const toolbarSelect = 'min-h-9 w-auto px-2.5 py-1 text-sm font-medium';

type ChatToolbarProps = { query: ChatScreenQuery; foldersOpen: boolean };

export function ChatToolbar({ query, foldersOpen }: ChatToolbarProps) {
  return (
    <>
      <div className="hidden min-w-0 flex-wrap items-center gap-2 md:contents">
        <ChatFolderSelect query={query} foldersOpen={foldersOpen} />
        <ChatStateSelect query={query} />
        <ChatSortSelect query={query} />
        <ChatChannelFilter query={query} />
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
      </div>
      <ChatFilterSheet query={query} />
    </>
  );
}

function ChatSortSelect({ query, className }: { query: ChatScreenQuery; className?: string }) {
  const router = useUrlRouter();
  return (
    <Select
      value={query.sort}
      onValueChange={(sort) =>
        router.replace(chatsHref({ ...query, sort: sort as ChatScreenQuery['sort'] }))
      }
    >
      <SelectTrigger aria-label="Sort chats" className={cn(toolbarSelect, className)}>
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
  );
}

// Phones fold every filter into one sheet so the list starts right under the search box.
function ChatFilterSheet({ query }: { query: ChatScreenQuery }) {
  const [open, setOpen] = useState(false);
  const active = [
    query.folder !== 'all',
    query.state !== 'open',
    query.sort !== 'needs_you',
    Boolean(query.channel),
    Boolean(query.assignee),
    Boolean(query.label),
  ].filter(Boolean).length;
  return (
    <div className="ml-auto md:hidden">
      <Button
        variant="secondary"
        size="sm"
        aria-label={active ? `Filters, ${active} on` : 'Filters'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal aria-hidden="true" size={16} />
        Filters
        {active ? (
          <span className="min-w-5 rounded-full bg-inverse px-1.5 text-xs text-on-primary tabular-nums">
            {active}
          </span>
        ) : null}
      </Button>
      <ChatFilterSheetBody
        query={query}
        open={open}
        active={active}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

type ChatFilterSheetBodyProps = {
  query: ChatScreenQuery;
  open: boolean;
  active: number;
  onClose: () => void;
};

function ChatFilterSheetBody({ query, open, active, onClose }: ChatFilterSheetBodyProps) {
  const router = useUrlRouter();
  return (
    <Sheet
      title="Filter chats"
      open={open}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <Button
            variant="link"
            className="text-text-muted"
            disabled={!active}
            onClick={() => router.replace(chatsHref(clearedFilters(query)))}
          >
            Clear all
          </Button>
          <Button className="bg-inverse text-on-primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SheetField label="Folder">
          <ChatFolderSelect query={query} foldersOpen={false} className="w-full" />
        </SheetField>
        <SheetField label="State">
          <ChatStateSelect query={query} className="w-full" />
        </SheetField>
        <SheetField label="Sort">
          <ChatSortSelect query={query} className="w-full" />
        </SheetField>
        <ChatChannelFilter query={query} heading="Channel" />
        <ChatAssigneeFilter query={query} />
        <LabelFilter query={query} />
      </div>
    </Sheet>
  );
}

function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold">{label}</p>
      {children}
    </div>
  );
}

function clearedFilters(query: ChatScreenQuery): ChatScreenQuery {
  return {
    ...query,
    folder: 'all',
    state: 'open',
    sort: 'needs_you',
    channel: undefined,
    assignee: undefined,
    label: undefined,
    chat: undefined,
  };
}

// The folder column replaces this picker when it is open; phones always pick the folder here.
function ChatFolderSelect({
  query,
  foldersOpen,
  className,
}: {
  query: ChatScreenQuery;
  foldersOpen: boolean;
  className?: string;
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
        className={cn(toolbarSelect, foldersOpen && 'lg:hidden', className)}
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

function ChatStateSelect({ query, className }: { query: ChatScreenQuery; className?: string }) {
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
      <SelectTrigger aria-label="Chat state" className={cn(toolbarSelect, className)}>
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

function ChatAssigneeFilter({ query }: { query: ChatScreenQuery }) {
  const router = useUrlRouter();
  const assignees = useConversationAssignees();
  return (
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
  );
}

function ChatFilterPanel({ query }: { query: ChatScreenQuery }) {
  const router = useUrlRouter();
  return (
    <div className="space-y-3">
      <ChatAssigneeFilter query={query} />
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
