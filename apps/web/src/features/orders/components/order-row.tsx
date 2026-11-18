import { ClipboardList, Instagram, MessageSquare, type LucideIcon } from 'lucide-react';

import type { OrderListItem, OrderSummary } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';

import { orderStageLabels } from '../order-labels';
import { OrderRiskBadge } from './order-risk-badge';
import { formatDateTime, formatRelativeTime } from '@/lib/format-date';
import { formatMoney } from '@/lib/format-money';

const sourceIcons: Partial<Record<OrderSummary['source'], LucideIcon>> = {
  messenger: MessageSquare,
  instagram: Instagram,
  whatsapp: MessageSquare,
  comment: MessageSquare,
};

export function OrderRow({ order }: { order: OrderListItem }) {
  const Icon = sourceIcons[order.source] ?? ClipboardList;

  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-3 p-4 md:grid-cols-[auto_1fr_auto] md:gap-4">
      <span className="grid size-9 place-items-center rounded-md bg-surface-muted">
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold wrap-anywhere">{order.recipientName}</span>
          <OrderRiskBadge risk={order.returnRisk} />
          {(order.stage === 'on_hold' || order.stage === 'partially_delivered') && (
            <Badge>{orderStageLabels[order.stage]}</Badge>
          )}
          {order.isWaitingForConfirmation ? (
            <span className="text-xs font-medium text-warning">Waiting 12h+</span>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">
          #{order.number} ·{' '}
          <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
            {formatRelativeTime(order.createdAt)}
          </time>
        </p>
        {order.itemPreview ? (
          <p className="mt-1 text-sm wrap-anywhere">{order.itemPreview}</p>
        ) : null}
      </div>
      <p className="col-start-2 tabular-nums md:col-start-auto md:text-right">
        <span className="block font-semibold">{formatMoney(order.totalPoisha)}</span>
        <span className="text-xs text-text-muted">
          {order.advancePaidPoisha > 0 ? `Advance ${formatMoney(order.advancePaidPoisha)} · ` : ''}
          {order.codCollectedPoisha === null ? 'COD' : 'COD received'}{' '}
          {formatMoney(order.codCollectedPoisha ?? order.codAmountPoisha)}
        </span>
      </p>
    </li>
  );
}
