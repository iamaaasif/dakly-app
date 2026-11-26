'use client';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { Button } from '@dakly/ui/button';
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
import { InboxIcon } from './inbox-icon';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const anyone = 'anyone';
const anyLabel = 'any-label';

export function ChatSearchBar({ query }: { query: ChatScreenQuery }) {
  const router = useRouter();
  const [words, setWords] = useState(query.q ?? '');
  const settled = useDebouncedValue(words.trim(), 300);

  useEffect(() => {
    if (settled === (query.q ?? '')) return;
    router.replace(chatsHref({ ...query, q: settled || undefined }));
  }, [settled, query, router]);

  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
        <InboxIcon name="search" />
      </span>
      <Input
        type="search"
        aria-label="Search chats"
        placeholder="Search name or phone"
        maxLength={120}
        value={words}
        onChange={(event) => setWords(event.target.value)}
        className="min-h-10 rounded-control border-border-strong bg-inbox-thread py-1 pl-9 text-sm"
      />
    </div>
  );
}

export function ChatToolbar({ query, channel }: { query: ChatScreenQuery; channel: ReactNode }) {
  const router = useRouter();
  return (
    <>
      <ChatFolderSelect query={query} />
      <Select
        value={query.sort}
        onValueChange={(sort) =>
          router.replace(chatsHref({ ...query, sort: sort as ChatScreenQuery['sort'] }))
        }
      >
        <SelectTrigger
          aria-label="Sort chats"
          className="min-h-10 w-auto rounded-md border-border-strong px-2.5 py-1 text-sm min-[1800px]:w-[201px] md:min-h-inbox-control"
        >
          <InboxIcon name="sort" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="inbox-theme">
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
          <Button
            variant="secondary"
            className="min-h-10 rounded-md border-border-strong px-2.5 py-1 text-sm md:min-h-inbox-control"
          >
            <InboxIcon name="filter" />
            Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent className="inbox-theme" aria-label="Filter chats">
          <ChatFilterPanel query={query} />
        </PopoverContent>
      </Popover>
    </>
  );
}

function ChatFolderSelect({ query }: { query: ChatScreenQuery }) {
  const router = useRouter();
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
      <SelectTrigger
        aria-label="Chat folder"
        className="hidden min-h-10 w-auto rounded-md border-border-strong px-2.5 py-1 text-sm min-[1440px]:flex min-[1800px]:w-40 md:min-h-inbox-control"
      >
        <InboxIcon name="chat" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="inbox-theme">
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
  const router = useRouter();
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
          <SelectContent className="inbox-theme">
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
  const router = useRouter();
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
        <SelectContent className="inbox-theme">
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
