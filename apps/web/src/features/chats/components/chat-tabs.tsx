import Link from 'next/link';

import type { ConversationCountsResponse } from '@dakly/contracts/chats';

import { chatTabLabels, chatTabs, chatsHref, type ChatScreenQuery } from '../chat-filters';

const countKeys: Record<(typeof chatTabs)[number], keyof ConversationCountsResponse> = {
  all: 'all',
  'needs-you': 'needsYou',
  'ai-handling': 'aiHandling',
  'follow-up': 'followUp',
  done: 'done',
  'not-customers': 'notCustomers',
};

type ChatTabsProps = { query: ChatScreenQuery; counts: ConversationCountsResponse | undefined };

export function ChatTabs({ query, counts }: ChatTabsProps) {
  return (
    <nav
      aria-label="Chat tabs"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2"
    >
      {chatTabs.map((tab) => (
        <Link
          key={tab}
          href={chatsHref({ ...query, tab })}
          aria-current={query.tab === tab ? 'page' : undefined}
          className="-mb-px inline-flex min-h-10 shrink-0 items-center gap-1 border-b-2 border-transparent px-2 text-base text-text-muted hover:text-text aria-[current=page]:border-action aria-[current=page]:font-semibold aria-[current=page]:text-text"
        >
          {chatTabLabels[tab]}
          {counts ? <span className="text-sm tabular-nums">{counts[countKeys[tab]]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
