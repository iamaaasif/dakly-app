import Link from 'next/link';

import { chatChannels } from '@dakly/contracts/channels';

import { chatChannelLabels, chatsHref, type ChatScreenQuery } from '../chat-filters';

export function ChatChannelFilter({ query }: { query: ChatScreenQuery }) {
  return (
    <nav aria-label="Channel" className="flex gap-2 overflow-x-auto">
      {[undefined, ...chatChannels].map((channel) => (
        <Link
          key={channel ?? 'all'}
          href={chatsHref({ ...query, channel })}
          aria-current={query.channel === channel ? 'page' : undefined}
          className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-border px-3 text-base hover:bg-surface-muted aria-[current=page]:border-inverse aria-[current=page]:bg-inverse aria-[current=page]:font-semibold aria-[current=page]:text-on-primary"
        >
          {channel ? chatChannelLabels[channel] : 'All'}
        </Link>
      ))}
    </nav>
  );
}
