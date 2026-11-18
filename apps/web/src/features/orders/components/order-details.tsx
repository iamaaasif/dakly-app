'use client';

import type { OrderDetail } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { useOrderStage } from '../api/orders';
import { orderStageLabels } from '../order-labels';
import { OrderItems } from './order-items';
import { OrderTimeline } from './order-timeline';
import { useSessionContext } from '@/lib/session-context';

export function OrderDetails({ order }: { order: OrderDetail }) {
  const { data } = useSessionContext();
  const transition = useOrderStage(order.id);
  const canConfirm =
    data?.currentStore?.canEditOrders &&
    ['to_confirm', 'on_hold'].includes(order.stage) &&
    order.source !== 'shopify' &&
    order.source !== 'woocommerce';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge>{orderStageLabels[order.stage]}</Badge>
        {canConfirm ? (
          <Button
            disabled={transition.isPending}
            onClick={() => transition.mutate({ to: 'to_pack' })}
          >
            Mark confirmed
          </Button>
        ) : null}
      </div>
      {transition.error ? (
        <p role="alert" className="text-danger">
          {transition.error.message}
        </p>
      ) : null}
      <section aria-label="Delivery details">
        <h3 className="text-md font-semibold">Delivery details</h3>
        <p>{order.recipientName}</p>
        <p>{order.recipientPhone}</p>
        <p>
          {order.recipientAddress}, {order.recipientDistrict}
        </p>
        {order.buyerName && !order.isRecipientBuyer ? (
          <p className="mt-2 text-text-muted">Buyer {order.buyerName}</p>
        ) : null}
      </section>
      <OrderItems order={order} />
      <OrderTimeline timeline={order.timeline} />
    </div>
  );
}
