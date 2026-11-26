import { Facebook, Instagram, MessageCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';

import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { contactDisplayName } from '../contact-name';
import { formatDate, formatTime } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

const channelIcons: Record<ConversationResponse['channel'], { icon: LucideIcon; label: string }> = {
  messenger: { icon: Facebook, label: 'Messenger' },
  instagram: { icon: Instagram, label: 'Instagram' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp' },
};

type ChatRowProps = {
  conversation: ConversationResponse;
  query: ChatScreenQuery;
  // Set while picking chats for a bulk action: the row then ticks instead of opening.
  selection?: { selected: boolean; onToggle: () => void };
};

const rowClasses = 'flex gap-3 border-l-2 border-transparent px-3 py-2.5 hover:bg-surface-muted';

export function ChatRow({ conversation, query, selection }: ChatRowProps) {
  const name = contactDisplayName(conversation);
  const content = <ChatRowContent conversation={conversation} name={name} />;
  if (selection)
    return (
      <li>
        <label className={cn(rowClasses, 'cursor-pointer items-center')}>
          <Checkbox
            aria-label={`Select ${name}`}
            checked={selection.selected}
            onCheckedChange={selection.onToggle}
          />
          {content}
        </label>
      </li>
    );
  return (
    <li>
      <Link
        href={chatsHref({ ...query, chat: conversation.id })}
        aria-current={query.chat === conversation.id ? 'true' : undefined}
        className={cn(
          rowClasses,
          'aria-[current=true]:border-primary aria-[current=true]:bg-primary-soft',
        )}
      >
        {content}
      </Link>
    </li>
  );
}

function ChatRowContent({
  conversation,
  name,
}: {
  conversation: ConversationResponse;
  name: string;
}) {
  return (
    <>
      <Avatar name={name} channel={conversation.channel} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-semibold">{name}</p>
          {conversation.lastMessageAt ? (
            <time
              dateTime={conversation.lastMessageAt}
              className="shrink-0 text-xs text-text-muted"
            >
              <LastActivity value={conversation.lastMessageAt} />
            </time>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm text-text-muted">
            {conversation.lastMessagePreview ?? ''}
          </p>
          <UnreadCount count={conversation.unreadCount} />
        </div>
        <ChatRowBadges conversation={conversation} />
      </div>
    </>
  );
}

function Avatar({ name, channel }: { name: string; channel: ConversationResponse['channel'] }) {
  const { icon: Icon, label } = channelIcons[channel];
  return (
    <div className="relative shrink-0">
      <span className="border-inbox-avatar-border bg-inbox-avatar text-inbox-avatar-text flex size-10 items-center justify-center rounded-full border text-xs font-semibold">
        {initialsOf(name)}
      </span>
      <Icon
        aria-label={label}
        role="img"
        size={14}
        className="absolute -right-1 -bottom-1 rounded-full bg-surface text-info"
      />
    </div>
  );
}

function UnreadCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-inverse text-xs font-semibold text-on-primary">
      <span className="sr-only">Unread: </span>
      {count}
    </span>
  );
}

function ChatRowBadges({ conversation }: { conversation: ConversationResponse }) {
  const { data: session } = useSessionContext();
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <Badge className={conversation.responder === 'ai' ? 'bg-inverse text-on-primary' : undefined}>
        {responderLabel(conversation, session?.user.id)}
      </Badge>
      {conversation.status === 'needs_you' ? <Badge variant="danger">Needs you</Badge> : null}
    </div>
  );
}

function LastActivity({ value }: { value: string }) {
  const today = formatDate(value, new Date().toISOString()) === 'Today';
  return <>{today ? formatTime(value) : formatDate(value, new Date().toISOString())}</>;
}

function responderLabel(conversation: ConversationResponse, userId: string | undefined) {
  if (conversation.responder === 'ai') return 'AI';
  if (conversation.responder === 'paused') return 'AI paused';
  return conversation.assigneeUserId === userId ? 'Me' : 'Team';
}
