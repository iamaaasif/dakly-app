import Link from 'next/link';
import type { RefObject } from 'react';

import type { OrderDetail } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';

import { courierLabels, orderStageLabels } from '../order-labels';
import { OrderItems } from './order-items';
import { OrderRiskBadge } from './order-risk-badge';
import { OrderTimeline } from './order-timeline';
import { formatPhone } from '@/lib/format-phone';
import { useSessionContext } from '@/lib/session-context';

export function OrderDetails({
  order,
  stageRef,
}: {
  order: OrderDetail;
  stageRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="space-y-6">
      <Badge
        ref={stageRef}
        tabIndex={-1}
        role="status"
        aria-label="Order stage"
        className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {orderStageLabels[order.stage]}
      </Badge>
      <DeliveryDetails order={order} />
      <ParcelDetails order={order} />
      <OrderItems order={order} />
      <OrderTimeline timeline={order.timeline} />
    </div>
  );
}

function DeliveryDetails({ order }: { order: OrderDetail }) {
  return (
    <section aria-label="Delivery details">
      <h3 className="text-md font-semibold">Delivery details</h3>
      <p className="wrap-anywhere">{order.recipientName}</p>
      <p>{formatPhone(order.recipientPhone)}</p>
      <OrderRiskBadge risk={order.returnRisk} />
      {order.returnRisk === 'high' &&
        order.advancePaidPoisha === 0 &&
        ['to_confirm', 'on_hold', 'to_pack'].includes(order.stage) && (
          <p className="text-sm text-warning">Ask for a small advance first</p>
        )}
      <p className="wrap-anywhere">
        {order.recipientAddress}, {order.recipientDistrict}
      </p>
      <BuyerDetails order={order} />
    </section>
  );
}

function ParcelDetails({ order }: { order: OrderDetail }) {
  return (
    <>
      {order.courier && (
        <p className="wrap-anywhere">
          Courier {order.courierOtherName ?? courierLabels[order.courier]}
        </p>
      )}
      {order.trackingCode && <p className="wrap-anywhere">Tracking code {order.trackingCode}</p>}
      {order.returnReason && <p className="wrap-anywhere">Return reason: {order.returnReason}</p>}
    </>
  );
}

function BuyerDetails({ order }: { order: OrderDetail }) {
  const { data } = useSessionContext();
  const canOpenBuyer = data?.currentStore?.canViewCustomers && order.buyerContactId;
  return (
    <p className="mt-2 wrap-anywhere text-text-muted">
      Buyer {order.buyerName ?? 'Unnamed customer'}{' '}
      {canOpenBuyer && (
        <Link
          className="inline-flex min-h-10 min-w-10 items-center text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          href={`/customers/${order.buyerContactId}`}
        >
          Open profile
        </Link>
      )}
    </p>
  );
}
