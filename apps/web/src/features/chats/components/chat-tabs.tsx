import Link from 'next/link';

import type { ConversationCountsResponse } from '@dakly/contracts/chats';

import { useConversationCounts } from '../api/conversations';
import { chatTabLabels, chatTabs, chatsHref, type ChatScreenQuery } from '../chat-filters';
import { InboxIcon } from './inbox-icon';

const countKeys: Record<(typeof chatTabs)[number], keyof ConversationCountsResponse> = {
  all: 'all',
  'needs-you': 'needsYou',
  'ai-handling': 'aiHandling',
  'follow-up': 'followUp',
  done: 'done',
  'not-customers': 'notCustomers',
};

const folderIcons = {
  all: 'all',
  'needs-you': 'mine',
  'ai-handling': 'ai',
  'follow-up': 'snoozed',
  done: 'resolved',
  'not-customers': 'not-customer',
} as const;

export function ChatTabs({ query }: { query: ChatScreenQuery }) {
  const { data: counts } = useConversationCounts();
  return (
    <nav
      aria-label="Chat tabs"
      className="flex shrink-0 gap-1 overflow-x-auto p-2.5 min-[1440px]:flex-col min-[1440px]:overflow-visible"
    >
      {chatTabs.map((tab) => {
        const icon = folderIcons[tab];
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
            className="flex min-h-10 min-w-0 shrink-0 items-center gap-2 rounded-control border border-transparent px-2.5 text-sm text-text-muted hover:bg-surface hover:text-text aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-text aria-[current=page]:shadow-inbox-folder"
          >
            <InboxIcon name={icon} />
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
