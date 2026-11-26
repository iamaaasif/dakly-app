import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@dakly/ui/button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@dakly/ui/popover';

import { useChatChannels } from '../api/chat-channels';
import {
  chatChannelLabels,
  chatScreenChannels,
  connectedScreenChannels,
  chatsHref,
  type ChatScreenQuery,
} from '../chat-filters';

export function ChatChannelFilter({ query }: { query: ChatScreenQuery }) {
  const connections = useChatChannels();
  // Chat staff without settings access cannot read the connections, so they see every channel.
  const connected = connections.isError
    ? chatScreenChannels
    : connectedScreenChannels(connections.data?.items ?? []);
  // The open channel stays listed so a link to it can still be cleared.
  const channels =
    query.channel && !connected.includes(query.channel) ? [...connected, query.channel] : connected;
  // One channel means nothing to choose between.
  if (channels.length < 2) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Channels"
          variant="secondary"
          className="min-h-10 rounded-md border-border-strong px-2.5 py-1 text-sm min-[1800px]:min-w-[126px] md:min-h-inbox-control"
        >
          {query.channel ? chatChannelLabels[query.channel] : 'All channels'}
          <ChevronDown aria-hidden="true" size={15} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="inbox-theme w-44 p-1">
        <nav aria-label="Channel" className="grid gap-0.5">
          {[undefined, ...channels].map((channel) => (
            <PopoverClose asChild key={channel ?? 'all'}>
              <Link
                href={chatsHref({ ...query, channel, post: undefined })}
                aria-current={query.channel === channel ? 'page' : undefined}
                className="rounded-md px-3 py-2 text-sm hover:bg-surface-muted aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold"
              >
                {channel ? chatChannelLabels[channel] : 'All'}
              </Link>
            </PopoverClose>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
