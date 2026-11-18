import Link from 'next/link';

import type { OrderDetail } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';

import { useOrderStage } from '../api/orders';
import { courierLabels, orderStageLabels } from '../order-labels';
import { OrderItems } from './order-items';
import { OrderRiskBadge } from './order-risk-badge';
import { OrderTimeline } from './order-timeline';
import { formatDateTime } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';
import { useSessionContext } from '@/lib/session-context';

export function OrderDetails({ order }: { order: OrderDetail }) {
  const { data } = useSessionContext();
  const transition = useOrderStage(order.id);
  const canConfirm =
    data?.currentStore?.canEditOrders &&
    ['to_confirm', 'on_hold'].includes(order.stage) &&
    !['shopify', 'woocommerce'].includes(order.source);

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
      <p className="text-sm text-text-muted capitalize">
        {order.source.replaceAll('_', ' ')} · {formatDateTime(order.createdAt)}
      </p>
      <section aria-label="Delivery details">
        <h3 className="text-md font-semibold">Delivery details</h3>
        <p className="wrap-anywhere">{order.recipientName}</p>
        <p>{formatPhone(order.recipientPhone)}</p>
        <OrderRiskBadge risk={order.returnRisk} />
        <p className="wrap-anywhere">
          {order.recipientAddress}, {order.recipientDistrict}
        </p>
        <BuyerDetails order={order} />
      </section>
      <ParcelDetails order={order} />
      <OrderItems order={order} />
      <OrderTimeline timeline={order.timeline} />
    </div>
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
        <Link className="text-action underline" href={`/customers/${order.buyerContactId}`}>
          Open profile
        </Link>
      )}
    </p>
  );
}
