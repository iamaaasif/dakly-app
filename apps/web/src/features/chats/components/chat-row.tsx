import Link from 'next/link';

import type { ConversationResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';

import { useConversationAssignees } from '../api/conversations';
import { chatsHref, type ChatScreenQuery } from '../chat-filters';
import { contactDisplayName } from '../contact-name';
import { handoverReasonLabels } from '../handover-reasons';
import { ChannelLogo } from '@/components/channel-logo';
import { formatDate, formatShortDate, formatTime } from '@/lib/format-date';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

const channelMarks: Record<ConversationResponse['channel'], { label: string; colour: string }> = {
  messenger: { label: 'Messenger', colour: 'bg-facebook' },
  instagram: { label: 'Instagram', colour: 'bg-instagram' },
  whatsapp: { label: 'WhatsApp', colour: 'bg-whatsapp' },
};

type ChatRowProps = {
  conversation: ConversationResponse;
  query: ChatScreenQuery;
  // Set while picking chats for a bulk action: the row then ticks instead of opening.
  selection?: { selected: boolean; onToggle: () => void };
  // Ticking the box that replaces the avatar on hover starts picking with this chat.
  onStartSelection?: () => void;
};

const rowClasses = 'flex gap-3 border-l-2 border-transparent px-3.5 py-3 hover:bg-surface-muted';

export function ChatRow({ conversation, query, selection, onStartSelection }: ChatRowProps) {
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
    <li className="group relative">
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
      {onStartSelection ? (
        <span className="absolute top-3 left-4 hidden size-10 items-center justify-center rounded-full bg-surface opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-fine:flex">
          <Checkbox
            aria-label={`Select ${name}`}
            checked={false}
            onCheckedChange={onStartSelection}
          />
        </span>
      ) : null}
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
          <p className="truncate text-sm text-text-muted">{previewOf(conversation)}</p>
          <UnreadCount count={conversation.unreadCount} />
        </div>
        <ChatRowBadges conversation={conversation} />
      </div>
    </>
  );
}

function Avatar({ name, channel }: { name: string; channel: ConversationResponse['channel'] }) {
  const { label, colour } = channelMarks[channel];
  return (
    <div className="relative shrink-0 self-start">
      <span className="flex size-10 items-center justify-center rounded-full bg-neutral-soft text-xs font-semibold text-text-secondary">
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
        <ChannelLogo channel={channel} size={10} />
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
  const { status, handoverReason, responder, contactKind, assigneeUserId } = conversation;
  const waiting = waitingState(conversation, new Date());
  const chips = [
    waiting === 'no_reply' ? (
      <Badge key="waiting" variant="danger" size="sm">
        No reply
      </Badge>
    ) : null,
    waiting === 'waiting' ? (
      <Badge key="waiting" size="sm">
        Waiting for them
      </Badge>
    ) : null,
    responder === 'human' ? null : (
      <Badge key="responder" variant="inverse" size="sm">
        {responder === 'ai' ? 'AI' : 'AI paused'}
      </Badge>
    ),
    contactKind === 'lead' ? (
      <Badge key="lead" variant="success" size="sm">
        Lead saved
      </Badge>
    ) : null,
  ].filter(Boolean);
  return (
    <>
      {status === 'needs_you' ? (
        <p className="mt-1 text-xs font-medium text-danger">
          {handoverReason ? `Needs you · ${handoverReasonLabels[handoverReason]}` : 'Needs you'}
        </p>
      ) : null}
      {chips.length || assigneeUserId ? (
        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1">
          {chips}
          <AssigneeMark userId={assigneeUserId} />
        </div>
      ) : null}
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

const NO_REPLY_AFTER_MS = 24 * 60 * 60 * 1000;

// The shop wrote last: Waiting for them, and No reply once a day has passed without an answer.
function waitingState(conversation: ConversationResponse, now: Date) {
  const { lastMessageFrom, lastMessageAt } = conversation;
  if (!lastMessageFrom || lastMessageFrom === 'customer' || !lastMessageAt) return null;
  return now.getTime() - new Date(lastMessageAt).getTime() > NO_REPLY_AFTER_MS
    ? 'no_reply'
    : 'waiting';
}

function previewOf({ lastMessagePreview, lastMessageFrom }: ConversationResponse) {
  if (!lastMessagePreview) return '';
  if (lastMessageFrom === 'ai' || lastMessageFrom === 'system')
    return `Dakly AI: ${lastMessagePreview}`;
  return lastMessageFrom === 'user' ? `You: ${lastMessagePreview}` : lastMessagePreview;
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
