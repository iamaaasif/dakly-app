import { Facebook, Instagram, MessageCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';

import { useConversationAssignees } from '../api/conversations';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { contactDisplayName } from '../contact-name';
import { handoverReasonLabels } from '../handover-reasons';
import { formatDate, formatShortDate, formatTime } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

const channelMarks: Record<
  ConversationResponse['channel'],
  { icon: LucideIcon; label: string; colour: string }
> = {
  messenger: { icon: Facebook, label: 'Messenger', colour: 'bg-facebook' },
  instagram: { icon: Instagram, label: 'Instagram', colour: 'bg-instagram' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp', colour: 'bg-success' },
};

type ChatRowProps = {
  conversation: ConversationResponse;
  query: ChatScreenQuery;
  // Set while picking chats for a bulk action: the row then ticks instead of opening.
  selection?: { selected: boolean; onToggle: () => void };
};

const rowClasses = 'flex gap-3 border-l-2 border-transparent px-3.5 py-3 hover:bg-surface-muted';

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
        <div className="mt-0.5 flex items-center justify-between gap-2">
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
  const { icon: Icon, label, colour } = channelMarks[channel];
  return (
    <div className="relative shrink-0 self-start">
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-text-muted">
        {initialsOf(name)}
      </span>
      <span
        role="img"
        aria-label={label}
        className={cn(
          'absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full text-on-primary ring-2 ring-surface',
          colour,
        )}
      >
        <Icon aria-hidden="true" size={9} strokeWidth={2.5} />
      </span>
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
  const needsYou = conversation.status === 'needs_you';
  return (
    <>
      {needsYou ? (
        <div className="mt-1.5 flex">
          <Badge variant="danger" size="sm">
            {conversation.handoverReason
              ? `Needs you · ${handoverReasonLabels[conversation.handoverReason]}`
              : 'Needs you'}
          </Badge>
        </div>
      ) : null}
      {conversation.responder === 'human' && !conversation.assigneeUserId ? null : (
        <div className="mt-1.5 flex min-h-5 items-center gap-1">
          {conversation.responder === 'human' ? null : (
            <Badge variant="inverse" size="sm">
              {conversation.responder === 'ai' ? 'AI' : 'AI paused'}
            </Badge>
          )}
          <AssigneeMark userId={conversation.assigneeUserId} />
        </div>
      )}
    </>
  );
}

// The person the chat is assigned to, as a small mark at the end of the row.
function AssigneeMark({ userId }: { userId: string | null }) {
  const { data: session } = useSessionContext();
  const assignees = useConversationAssignees();
  if (!userId) return null;
  const mine = userId === session?.user.id;
  const name = mine ? 'you' : assignees.data?.find((assignee) => assignee.userId === userId)?.name;
  if (!name) return null;
  return (
    <span
      title={`Assigned to ${name}`}
      className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-inverse text-xs leading-none font-semibold tracking-tight text-on-primary"
    >
      <span className="sr-only">Assigned to {name}</span>
      <span aria-hidden="true">{mine ? 'Me' : name.trim().slice(0, 2)}</span>
    </span>
  );
}

function LastActivity({ value }: { value: string }) {
  return <>{formatListTime(value, new Date())}</>;
}

// Recent activity reads as minutes, today's as the time, older as the day.
function formatListTime(value: string, now: Date) {
  const minutes = Math.floor((now.getTime() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min`;
  const day = formatDate(value, now.toISOString());
  if (day === 'Today') return formatTime(value);
  return day === 'Yesterday' ? day : formatShortDate(value);
}
