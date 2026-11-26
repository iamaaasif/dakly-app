import { Bot, CircleCheck, Clock, Inbox, UserRound, UserX } from 'lucide-react';
import Link from 'next/link';

import type { ConversationCountsResponse } from '@dakly/contracts/chats';

import { useConversationCounts } from '../api/conversations';
import { chatTabLabels, chatTabs, chatsHref, type ChatScreenQuery } from '../chat-filters';

const countKeys: Record<(typeof chatTabs)[number], keyof ConversationCountsResponse> = {
  all: 'all',
  'needs-you': 'needsYou',
  'ai-handling': 'aiHandling',
  'follow-up': 'followUp',
  done: 'done',
  'not-customers': 'notCustomers',
};

const folderIcons = {
  all: Inbox,
  'needs-you': UserRound,
  'ai-handling': Bot,
  'follow-up': Clock,
  done: CircleCheck,
  'not-customers': UserX,
} as const;

export function ChatTabs({ query }: { query: ChatScreenQuery }) {
  const { data: counts } = useConversationCounts();
  return (
    <nav
      aria-label="Chat tabs"
      className="flex shrink-0 gap-1 overflow-x-auto p-2.5 xl:flex-col xl:overflow-visible"
    >
      {chatTabs.map((tab) => {
        const Icon = folderIcons[tab];
        return (
          <Link
            key={tab}
            href={chatsHref({
              ...query,
              tab,
              channel: query.channel === 'comments' ? undefined : query.channel,
              chat: undefined,
              panel: undefined,
              post: undefined,
            })}
            aria-current={query.tab === tab ? 'page' : undefined}
            className="flex min-h-10 min-w-0 shrink-0 items-center gap-2 rounded-md border border-transparent px-2.5 text-sm text-text-muted hover:bg-surface hover:text-text aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-text"
          >
            <Icon aria-hidden="true" size={16} />
            <span className="flex-1 truncate">{chatTabLabels[tab]}</span>
            {counts ? (
              <span className="font-normal tabular-nums">{counts[countKeys[tab]]}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
