'use client';
import { ShoppingBag, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { formatCount, formatMoney } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';

import { useAgentSettings } from '../api/agent-settings';
import { useConversationSummary } from '../api/conversation-summary';
import { useConversationCounts } from '../api/conversations';

// Three facts about the shop's day; a pill that cannot load is left out rather than shown as zero.
export function ChatHeaderPills() {
  const counts = useConversationCounts();
  const settings = useAgentSettings();
  const summary = useConversationSummary();
  const orders = summary.data?.chatOrdersToday;
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {counts.data ? (
        <li>
          <Pill variant={counts.data.needsYou > 0 ? 'warning' : 'neutral'} icon={TriangleAlert}>
            {formatCount(counts.data.needsYou)} need you
          </Pill>
        </li>
      ) : null}
      {settings.data ? (
        <li>
          <Pill variant={settings.data.isAutoReplyOn ? 'success' : 'neutral'} icon={Sparkles}>
            {settings.data.isAutoReplyOn ? 'AI auto-reply on' : 'AI auto-reply off'}
            {summary.data ? ` · ${repliesToday(summary.data.aiRepliesToday)}` : ''}
          </Pill>
        </li>
      ) : null}
      {orders ? (
        <li>
          <Pill variant="success" icon={ShoppingBag}>
            {formatCount(orders.count)} {orders.count === 1 ? 'order' : 'orders'} from chats today ·{' '}
            {formatMoney(orders.totalPoisha)}
          </Pill>
        </li>
      ) : null}
    </ul>
  );
}

function repliesToday(count: number) {
  return `${formatCount(count)} ${count === 1 ? 'reply' : 'replies'} today`;
}

function Pill({
  variant,
  icon: Icon,
  children,
}: {
  variant: 'warning' | 'success' | 'neutral';
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <Badge variant={variant} className="gap-1.5 rounded-md px-2 py-1 text-xs">
      <Icon aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0" />
      <span>{children}</span>
    </Badge>
  );
}
