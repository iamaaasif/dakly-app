import { Check, Copy, StickyNote } from 'lucide-react';
import { useState } from 'react';

import type { ConversationMessageResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';

import { formatDate, formatTime } from '@/lib/format-date';

const kindLabels: Partial<Record<ConversationMessageResponse['kind'], string>> = {
  image: 'Photo',
  voice: 'Voice note',
  video: 'Video',
  file: 'File',
  product_card: 'Product card',
  order_card: 'Order card',
  payment_link: 'Payment link',
  template: 'Template',
};

const failureLabels = {
  permission_missing:
    'Not sent: Meta has not approved the Human Agent permission for this page, or the page connection needs renewing',
  send_rejected: 'Not sent: Meta refused the message, usually because the reply window is over',
  connection_unavailable: 'Not sent: the page connection is unavailable. Reconnect the channel',
} as const;

const statusLabels: Record<ConversationMessageResponse['status'], string> = {
  received: '',
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not sent',
};

function bubbleStyle({ kind, direction }: ConversationMessageResponse) {
  if (kind === 'note') return 'border border-warning bg-warning-soft text-text';
  return direction === 'out'
    ? 'border border-border bg-primary-soft text-text'
    : 'border border-border bg-surface text-text';
}

export function MessageBubble({ message }: { message: ConversationMessageResponse }) {
  if (message.kind === 'system')
    return (
      <li className="mx-auto w-fit max-w-full rounded-full bg-surface-muted px-3 py-1 text-center text-xs text-text-muted">
        {message.body}
      </li>
    );
  const outgoing = message.direction === 'out';
  return (
    <li className={cn('flex flex-col gap-1', outgoing ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'rounded-xl max-w-[85%] px-3 py-2 text-base break-words whitespace-pre-wrap',
          bubbleStyle(message),
        )}
      >
        {message.kind === 'note' ? (
          <span className="mb-1 flex items-center gap-1 text-sm font-semibold">
            <StickyNote aria-hidden="true" size={14} strokeWidth={1.75} />
            Internal note
          </span>
        ) : null}
        {message.body || kindLabels[message.kind] || ''}
      </div>
      <MessageMeta message={message} />
    </li>
  );
}

function MessageMeta({ message }: { message: ConversationMessageResponse }) {
  const delivery = message.direction === 'out' && message.kind !== 'note';
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-text-muted">
      {message.authorType === 'ai' ? <Badge variant="inverse">AI</Badge> : null}
      <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
      {delivery ? (
        <span>
          {message.failureReason
            ? failureLabels[message.failureReason]
            : statusLabels[message.status]}
        </span>
      ) : null}
      {message.body ? <CopyMessageButton body={message.body} /> : null}
    </div>
  );
}

// Today's messages show the time; older ones show the day.
function messageTime(value: string) {
  const day = formatDate(value, new Date().toISOString());
  return day === 'Today' ? formatTime(value) : day;
}

function CopyMessageButton({ body }: { body: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy message"
      className="inline-flex size-6 items-center justify-center rounded-sm hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus"
      onClick={() => {
        void navigator.clipboard.writeText(body).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
    </button>
  );
}
