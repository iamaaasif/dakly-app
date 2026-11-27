import {
  ClipboardList,
  Instagram,
  MessageCircle,
  MessageSquare,
  Phone,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';

import { formatMoney } from '@dakly/contracts/money';
import type { OrderListItem, OrderSummary } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';

import { isFinishedOrder } from '../order-actions';
import { orderCustomerBadgeLabels, orderSourceLabels, orderStageLabels } from '../order-labels';
import { OrderRiskBadge } from './order-risk-badge';
import { OrderRowAction } from './order-row-action';
import { OrderRowParcel } from './order-row-parcel';
import { rowClass, rowLinkClass } from './order-row-styles';
import { UrlLink } from '@/components/url-link';
import { formatDateTime, formatRelativeTime } from '@/lib/format-date';

type SourceStyle = { icon: LucideIcon; bgClass: string; textClass: string };

const sourceStyles: Record<OrderSummary['source'], SourceStyle> = {
  messenger: { icon: MessageSquare, bgClass: 'bg-info-soft', textClass: 'text-facebook' },
  instagram: { icon: Instagram, bgClass: 'bg-danger-soft', textClass: 'text-instagram' },
  whatsapp: { icon: MessageCircle, bgClass: 'bg-success-soft', textClass: 'text-success' },
  comment: { icon: MessageSquare, bgClass: 'bg-surface-muted', textClass: 'text-text-muted' },
  order_link: { icon: ShoppingBag, bgClass: 'bg-warning-soft', textClass: 'text-warning' },
  manual: { icon: Phone, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  pos_csv: { icon: ClipboardList, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  shopify: { icon: ShoppingBag, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  woocommerce: { icon: ShoppingBag, bgClass: 'bg-surface-muted', textClass: 'text-text' },
  khata_import: { icon: ShoppingBag, bgClass: 'bg-surface-muted', textClass: 'text-text' },
};

type OrderRowProps = {
  order: OrderListItem;
  href: string;
  canEdit: boolean;
  selection?: { checked: boolean; disabled: boolean; onToggle: () => void };
};

// The name link covers the whole row, so a tap anywhere opens the order. The tick box and the
// action sit above it.
export function OrderRow({ order, href, canEdit, selection }: OrderRowProps) {
  return (
    <li className={rowClass}>
      <div className="relative z-10 flex items-center gap-2">
        {selection ? (
          <Checkbox
            aria-label={`Select order #${order.number} for shipping labels`}
            checked={selection.checked}
            disabled={selection.disabled}
            onCheckedChange={selection.onToggle}
          />
        ) : null}
        <SourceTile source={order.source} />
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UrlLink href={href} data-row-link className={rowLinkClass}>
            {order.buyerName ?? order.recipientName}
          </UrlLink>
          <span className="text-xs text-text-muted tabular-nums">
            #{order.number} ·{' '}
            <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
              {formatRelativeTime(order.createdAt)}
            </time>
            {order.buyerName && order.buyerName !== order.recipientName
              ? ` · to ${order.recipientName}`
              : null}
          </span>
          <OrderRowBadges order={order} />
        </div>
        {order.itemPreview ? (
          <p className="mt-0.5 text-sm wrap-anywhere text-text-muted">{order.itemPreview}</p>
        ) : null}
        <OrderRowParcel order={order} />
      </div>
      <OrderAmount order={order} />
      <div className="relative z-10 justify-self-end">
        <OrderRowAction order={order} href={href} canEdit={canEdit} />
      </div>
    </li>
  );
}

function SourceTile({ source }: { source: OrderSummary['source'] }) {
  const style = sourceStyles[source];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-md',
        style.bgClass,
        style.textClass,
      )}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{orderSourceLabels[source]}</span>
    </span>
  );
}

const customerBadgeVariants = {
  new: 'info',
  repeat: 'neutral',
  vip: 'success',
} as const;

type OrderRowBadgesProps = { order: OrderListItem };

function OrderRowBadges({ order }: OrderRowBadgesProps) {
  return (
    <>
      <Badge
        variant={customerBadgeVariants[order.customerBadge]}
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      >
        {orderCustomerBadgeLabels[order.customerBadge]}
      </Badge>
      {isFinishedOrder(order.stage) ? null : <OrderRiskBadge risk={order.returnRisk} />}
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
