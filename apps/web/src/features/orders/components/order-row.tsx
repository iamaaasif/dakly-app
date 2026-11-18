import { ClipboardList, Instagram, MessageSquare, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import type { OrderListItem, OrderSummary } from '@dakly/contracts/orders';

import { OrderRiskBadge } from './order-risk-badge';
import { formatDateTime } from '@/lib/format-date';
import { formatMoney } from '@/lib/format-money';

const sourceIcons: Partial<Record<OrderSummary['source'], LucideIcon>> = {
  messenger: MessageSquare,
  instagram: Instagram,
  whatsapp: MessageSquare,
  comment: MessageSquare,
};

type OrderRowProps = { order: OrderListItem; href: string; canEdit: boolean };

export function OrderRow({ order, href, canEdit }: OrderRowProps) {
  const Icon = sourceIcons[order.source] ?? ClipboardList;
  const canConfirm =
    canEdit &&
    order.stage === 'to_confirm' &&
    order.source !== 'shopify' &&
    order.source !== 'woocommerce';

  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-3 p-4 md:grid-cols-[auto_1fr_auto_auto] md:gap-4">
      <span className="grid size-9 place-items-center rounded-md bg-surface-muted">
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={href}
            className="inline-flex min-h-10 max-w-full min-w-10 items-center font-semibold wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {order.recipientName}
          </Link>
          <OrderRiskBadge risk={order.returnRisk} />
          {order.isWaitingForConfirmation ? (
            <span className="text-xs font-medium text-warning">Waiting 12h+</span>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">
          #{order.number} ·{' '}
          <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
        </p>
        {order.itemPreview ? (
          <p className="mt-1 text-sm wrap-anywhere">{order.itemPreview}</p>
        ) : null}
      </div>
      <OrderAmount order={order} />
      <Link
        href={href}
        aria-label={`${canConfirm ? 'Confirm' : 'Details for'} order #${order.number}`}
        className="col-start-2 inline-flex min-h-10 w-fit items-center rounded-md bg-inverse px-3 font-medium text-on-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:col-start-auto"
      >
        {canConfirm ? 'Confirm' : 'Details'}
      </Link>
    </li>
  );
}

function OrderAmount({ order }: { order: OrderListItem }) {
  const total =
    BigInt(order.deliveredItemsSubtotalPoisha ?? order.itemsSubtotalPoisha) +
    BigInt(order.deliveryChargePoisha) -
    BigInt(order.deliveredOrderDiscountPoisha ?? order.orderDiscountPoisha);

  return (
    <p className="col-start-2 tabular-nums md:col-start-auto md:text-right">
      <span className="block font-semibold">{formatMoney(total)}</span>
      <span className="text-xs text-text-muted">
        {order.advancePaidPoisha > 0 ? `Advance ${formatMoney(order.advancePaidPoisha)} · ` : ''}
        {order.codCollectedPoisha === null ? 'COD' : 'COD received'}{' '}
        {formatMoney(order.codCollectedPoisha ?? order.codAmountPoisha)}
      </span>
    </p>
  );
}
