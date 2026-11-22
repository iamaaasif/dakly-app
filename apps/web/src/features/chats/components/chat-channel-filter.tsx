import Link from 'next/link';

import { useChatChannels } from '../api/chat-channels';
import {
  chatChannelLabels,
  connectedScreenChannels,
  chatsHref,
  type ChatScreenQuery,
} from '../chat-filters';

export function ChatChannelFilter({ query }: { query: ChatScreenQuery }) {
  const connections = useChatChannels();
  const connected = connectedScreenChannels(connections.data?.items ?? []);
  // The open channel stays listed so a link to it can still be cleared.
  const channels =
    query.channel && !connected.includes(query.channel) ? [...connected, query.channel] : connected;
  // One channel means nothing to choose between.
  if (channels.length < 2) return null;
  return (
    <nav aria-label="Channel" className="flex gap-2 overflow-x-auto">
      {[undefined, ...channels].map((channel) => (
        <Link
          key={channel ?? 'all'}
          href={chatsHref({ ...query, channel, post: undefined })}
          aria-current={query.channel === channel ? 'page' : undefined}
          className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-border px-3 text-base hover:bg-surface-muted aria-[current=page]:border-inverse aria-[current=page]:bg-inverse aria-[current=page]:font-semibold aria-[current=page]:text-on-primary"
        >
          {channel ? chatChannelLabels[channel] : 'All'}
        </Link>
      ))}
    </nav>
  );
}
