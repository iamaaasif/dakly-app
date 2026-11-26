import {
  Ban,
  Bot,
  CircleCheck,
  Clock,
  Inbox,
  ShoppingBag,
  UserRound,
  UserX,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import type { ConversationCountsResponse } from '@dakly/contracts/chats';

import { useConversationCounts } from '../api/conversations';
import {
  chatFolderLabels,
  chatStateLabels,
  chatsHref,
  type ChatScreenQuery,
} from '../chat-filters';

// Snoozed and Resolved are the All conversations folder in that state, listed as folders.
type FolderEntry = {
  folder: ChatScreenQuery['folder'];
  state: ChatScreenQuery['state'];
  label: string;
  icon: LucideIcon;
  count: keyof ConversationCountsResponse;
};

const entry = (folder: ChatScreenQuery['folder'], icon: LucideIcon): FolderEntry => ({
  folder,
  state: 'open',
  label: chatFolderLabels[folder],
  icon,
  count: folder,
});

const stateEntry = (state: 'snoozed' | 'resolved', icon: LucideIcon): FolderEntry => ({
  folder: 'all',
  state,
  label: chatStateLabels[state],
  icon,
  count: state,
});

const folders = [
  entry('all', Inbox),
  entry('mine', UserRound),
  entry('unassigned', UserX),
  entry('unreplied', UsersRound),
  entry('ai_handling', Bot),
  entry('order_request', ShoppingBag),
  stateEntry('snoozed', Clock),
  stateEntry('resolved', CircleCheck),
  entry('not_customers', UserX),
];
const tickets = [entry('spam', Ban)];

export function ChatFolders({ query }: { query: ChatScreenQuery }) {
  const { data: counts } = useConversationCounts();
  return (
    <nav aria-label="Chat folders" className="flex shrink-0 flex-col p-2.5">
      {folders.map((item) => (
        <FolderLink key={item.label} item={item} query={query} counts={counts} />
      ))}
      <h2 className="mt-4 px-2.5 pb-1 text-sm font-semibold">Tickets</h2>
      {tickets.map((item) => (
        <FolderLink key={item.label} item={item} query={query} counts={counts} />
      ))}
    </nav>
  );
}

function isCurrent(item: FolderEntry, query: ChatScreenQuery) {
  if (item.folder !== query.folder) return false;
  // All conversations stays marked under the picker's states; Snoozed and Resolved only in theirs.
  return item.state === 'open'
    ? query.folder !== 'all' || query.state === 'open'
    : item.state === query.state;
}

function FolderLink({
  item,
  query,
  counts,
}: {
  item: FolderEntry;
  query: ChatScreenQuery;
  counts: ConversationCountsResponse | undefined;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={chatsHref({
        ...query,
        folder: item.folder,
        state: item.state,
        channel: query.channel === 'comments' ? undefined : query.channel,
        chat: undefined,
        panel: undefined,
        post: undefined,
      })}
      aria-current={isCurrent(item, query) ? 'page' : undefined}
      className="flex min-h-10 min-w-0 shrink-0 items-center gap-2 rounded-md border border-transparent px-2.5 text-base text-text hover:bg-surface aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-semibold"
    >
      <Icon aria-hidden="true" size={16} className="shrink-0 text-text-muted" />
      <span className="flex-1 truncate">{item.label}</span>
      {counts && item.folder === 'all' && item.state === 'open' && counts.unread > 0 ? (
        <span className="text-sm font-normal text-ai tabular-nums">
          {counts.unread}
          <span className="sr-only">{' unread'}</span>
        </span>
      ) : null}
      {counts ? (
        <span className="text-sm font-normal text-text-muted tabular-nums">
          {counts[item.count]}
        </span>
      ) : null}
    </Link>
  );
}
