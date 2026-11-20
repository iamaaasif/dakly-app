import {
  ClipboardList,
  Instagram,
  MessageCircle,
  MessageSquare,
  Phone,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { formatMoney } from '@dakly/contracts/money';
import type { OrderListItem, OrderSummary } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';

import { canConfirmOrder } from '../order-actions';
import { orderStageLabels } from '../order-labels';
import { OrderRiskBadge } from './order-risk-badge';
import { formatDateTime, formatRelativeTime } from '@/lib/format-date';

type SourceStyle = { icon: LucideIcon; bgClass: string; textClass: string };

const sourceStyles: Record<OrderSummary['source'], SourceStyle> = {
  messenger: { icon: MessageSquare, bgClass: 'bg-info-soft', textClass: 'text-info' },
  instagram: { icon: Instagram, bgClass: 'bg-danger-soft', textClass: 'text-danger' },
  whatsapp: { icon: MessageCircle, bgClass: 'bg-success-soft', textClass: 'text-success' },
  comment: { icon: MessageSquare, bgClass: 'bg-surface-muted', textClass: 'text-text-muted' },
  order_link: { icon: ShoppingBag, bgClass: 'bg-warning-soft', textClass: 'text-warning' },
  manual: { icon: Phone, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  pos_csv: { icon: ClipboardList, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  shopify: { icon: ShoppingBag, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  woocommerce: { icon: ShoppingBag, bgClass: 'bg-surface-muted', textClass: 'text-text' },
};

type OrderRowProps = { order: OrderListItem; href: string; canEdit: boolean };

export function OrderRow({ order, href, canEdit }: OrderRowProps) {
  const style = sourceStyles[order.source] ?? {
    icon: ClipboardList,
    bgClass: 'bg-surface-muted',
    textClass: 'text-text',
  };
  const Icon = style.icon;
  const canConfirm = canConfirmOrder(order, canEdit);

  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-3 p-4 md:grid-cols-[auto_1fr_auto_auto] md:gap-4">
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          style.bgClass,
          style.textClass,
        )}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={href}
            className="inline-flex min-h-11 max-w-full items-center font-semibold wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:min-h-fit"
          >
            {order.recipientName}
          </Link>
          <span className="text-xs text-text-muted">
            #{order.number} ·{' '}
            <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
              {formatRelativeTime(order.createdAt)}
            </time>
          </span>
          <OrderRowBadges order={order} />
        </div>
        {order.itemPreview ? (
          <p className="mt-0.5 text-sm wrap-anywhere text-text-muted">{order.itemPreview}</p>
        ) : null}
      </div>
      <OrderAmount order={order} />
      <Link
        href={href}
        data-order-row-action={order.id}
        aria-label={`${canConfirm ? 'Confirm' : 'Details for'} order #${order.number}`}
        className="col-start-2 inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-inverse px-3.5 text-sm font-medium text-on-primary hover:bg-inverse/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:col-start-auto md:h-9 md:min-h-9"
      >
        {canConfirm ? 'Confirm' : 'Details'}
      </Link>
    </li>
  );
}

type OrderRowBadgesProps = { order: OrderListItem };

function OrderRowBadges({ order }: OrderRowBadgesProps) {
  return (
    <>
      <OrderRiskBadge risk={order.returnRisk} />
      {(order.stage === 'on_hold' || order.stage === 'partially_delivered') && (
        <Badge variant="neutral" className="rounded-full px-2.5 py-0.5 text-xs font-medium">
          {orderStageLabels[order.stage]}
        </Badge>
      )}
      {order.isWaitingForConfirmation ? (
        <Badge variant="warning" className="rounded-full px-2.5 py-0.5 text-xs font-medium">
          Waiting 12h+
        </Badge>
      ) : null}
    </>
  );
}

type OrderAmountProps = { order: OrderListItem };

function OrderAmount({ order }: OrderAmountProps) {
  return (
    <div className="col-start-2 tabular-nums md:col-start-auto md:text-right">
      <span className="block text-base font-bold text-text">{formatMoney(order.totalPoisha)}</span>
      <span className="block text-xs text-text-muted">
        {order.advancePaidPoisha > 0 ? `Advance ${formatMoney(order.advancePaidPoisha)} · ` : ''}
        {order.codCollectedPoisha === null ? 'COD' : 'COD received'}{' '}
        {formatMoney(order.codCollectedPoisha ?? order.codAmountPoisha)}
      </span>
    </div>
  );
}
