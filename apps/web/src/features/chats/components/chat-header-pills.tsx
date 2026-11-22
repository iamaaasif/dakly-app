'use client';
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
          <Badge variant={counts.data.needsYou > 0 ? 'warning' : 'neutral'}>
            {formatCount(counts.data.needsYou)} need you
          </Badge>
        </li>
      ) : null}
      {settings.data ? (
        <li>
          <Badge variant={settings.data.isAutoReplyOn ? 'success' : 'neutral'}>
            {settings.data.isAutoReplyOn ? 'AI auto-reply on' : 'AI auto-reply off'}
            {summary.data ? ` · ${repliesToday(summary.data.aiRepliesToday)}` : ''}
          </Badge>
        </li>
      ) : null}
      {orders ? (
        <li>
          <Badge variant="success">
            {formatCount(orders.count)} {orders.count === 1 ? 'order' : 'orders'} from chats today ·{' '}
            {formatMoney(orders.totalPoisha)}
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}

function repliesToday(count: number) {
  return `${formatCount(count)} ${count === 1 ? 'reply' : 'replies'} today`;
}
