import { StickyNote } from 'lucide-react';

import type { ConversationMessageResponse } from '@dakly/contracts/chats';
import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';

import { formatTime } from '@/lib/format-date';

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
  return direction === 'out' ? 'bg-primary text-on-primary' : 'bg-surface-muted text-text';
}

export function MessageBubble({ message }: { message: ConversationMessageResponse }) {
  if (message.kind === 'system')
    return <li className="text-center text-sm text-text-muted">{message.body}</li>;
  const outgoing = message.direction === 'out';
  return (
    <li className={cn('flex flex-col gap-1', outgoing ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'rounded-2xl max-w-[85%] px-4 py-2 text-base break-words whitespace-pre-wrap',
          bubbleStyle(message),
        )}
      >
        {message.kind === 'note' ? (
          <span className="mb-1 flex items-center gap-1 text-sm font-semibold">
            <StickyNote aria-hidden="true" size={14} strokeWidth={1.75} />
            Internal note
          </span>
        ) : null}
        {message.body ?? kindLabels[message.kind] ?? ''}
      </div>
      <MessageMeta message={message} />
    </li>
  );
}

function MessageMeta({ message }: { message: ConversationMessageResponse }) {
  const delivery = message.direction === 'out' && message.kind !== 'note';
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      {message.authorType === 'ai' ? <Badge variant="ai">AI</Badge> : null}
      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
      {delivery ? <span>{statusLabels[message.status]}</span> : null}
    </div>
  );
}
