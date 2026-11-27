import { ChevronRight, ImageOff } from 'lucide-react';
import Link from 'next/link';

import type { CustomerOrderResponse } from '@dakly/contracts/customer-profile';
import { formatMoney } from '@dakly/contracts/money';
import { orderStageLabels } from '@dakly/contracts/order-stage-labels';
import { Badge } from '@dakly/ui/badge';

import { useCustomerOrders } from '../api/customer-profile';
import { profileSourceLabels } from '../customer-labels';
import { LoadMore, PartEmpty, PartError, RowsSkeleton } from './profile-parts';
import { formatShortDate } from '@/lib/format-date';

type StageVariant = 'success' | 'danger' | 'warning' | 'neutral';

function stageVariant(stage: CustomerOrderResponse['stage']): StageVariant {
  if (stage === 'delivered') return 'success';
  if (stage === 'returned' || stage === 'cancelled') return 'danger';
  if (stage === 'on_hold' || stage === 'partially_delivered') return 'warning';
  return 'neutral';
}

export function ProfileOrders({ contactId }: { contactId: string }) {
  const orders = useCustomerOrders(contactId);
  if (orders.error) return <PartError error={orders.error} onRetry={() => void orders.refetch()} />;
  if (orders.isPending) return <RowsSkeleton label="Loading orders" />;
  const rows = orders.data.pages.flatMap((page) => page.items);
  if (!rows.length) return <PartEmpty>This customer has no orders yet.</PartEmpty>;
  return (
    <>
      <ul className="space-y-2">
        {rows.map((order) => (
          <li key={order.id}>
            <OrderRow order={order} />
          </li>
        ))}
      </ul>
      <LoadMore
        hasNext={orders.hasNextPage}
        loading={orders.isFetchingNextPage}
        onMore={() => void orders.fetchNextPage()}
      />
    </>
  );
}

function OrderRow({ order }: { order: CustomerOrderResponse }) {
  const item = [order.firstItemName, order.firstItemVariantTitle].filter(Boolean).join(' – ');
  return (
    <Link
      href={`/orders?selected=${order.id}`}
      className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted text-text-subtle">
        {order.photoUrl ? (
          <img src={order.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <ImageOff aria-hidden="true" size={14} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {item}
          {order.otherItemCount ? (
            <span className="font-normal text-text-muted"> +{order.otherItemCount} more</span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-text-muted tabular-nums">
          #{order.number} · {formatShortDate(order.createdAt)} · {profileSourceLabels[order.source]}
        </span>
      </span>
      <Badge variant={stageVariant(order.stage)} className="shrink-0 rounded-full px-2.5">
        {orderStageLabels[order.stage]}
      </Badge>
      <span className="w-20 shrink-0 text-right text-base font-semibold tabular-nums">
        {formatMoney(order.totalPoisha)}
      </span>
      <ChevronRight
        aria-hidden="true"
        size={16}
        className="hidden shrink-0 -translate-x-1 text-text-subtle opacity-0 transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none sm:block"
      />
    </Link>
  );
}
