import { Truck } from 'lucide-react';

import type { OrderListItem } from '@dakly/contracts/orders';

import { courierLabels } from '../order-labels';
import { formatShortDate } from '@/lib/format-date';

type OrderRowParcelProps = { order: OrderListItem };

export function OrderRowParcel({ order }: OrderRowParcelProps) {
  const { courier, stage, returnedAt, returnReason } = order;
  if (!courier) return null;
  const name = order.courierOtherName ?? courierLabels[courier];
  return (
    <>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-info">
        <Truck size={13} aria-hidden="true" />
        <span>
          {name}
          {stage === 'returned' && returnedAt ? ` · Returned ${formatShortDate(returnedAt)}` : ''}
        </span>
      </p>
      {stage === 'returned' && returnReason ? (
        <p className="mt-0.5 text-xs wrap-anywhere text-danger">{returnReason}</p>
      ) : null}
    </>
  );
}
