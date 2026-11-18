import { ClipboardList, Instagram, MessageSquare, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import type { OrderSummary } from '@dakly/contracts/orders';

import { formatDateTime } from '@/lib/format-date';
import { formatMoney } from '@/lib/format-money';

const sourceIcons: Partial<Record<OrderSummary['source'], LucideIcon>> = {
  messenger: MessageSquare,
  instagram: Instagram,
  whatsapp: MessageSquare,
  comment: MessageSquare,
};

type OrderRowProps = { order: OrderSummary; href: string; canEdit: boolean };

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
        <Link href={href} className="font-semibold break-words hover:underline">
          {order.buyerName ?? order.recipientName}
        </Link>
        <p className="text-xs text-text-muted">
          #{order.number} ·{' '}
          <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
        </p>
      </div>
      <p className="col-start-2 text-sm font-semibold tabular-nums md:col-start-auto md:text-right">
        COD {formatMoney(order.codAmountPoisha)}
      </p>
      <Link
        href={href}
        aria-label={`${canConfirm ? 'Confirm' : 'Details for'} order #${order.number}`}
        className="col-start-2 inline-flex min-h-10 w-fit items-center rounded-md bg-inverse px-3 font-medium text-on-primary hover:underline md:col-start-auto"
      >
        {canConfirm ? 'Confirm' : 'Details'}
      </Link>
    </li>
  );
}
