import Link from 'next/link';
import type { RefObject } from 'react';

import type { OrderDetail } from '@dakly/contracts/orders';
import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';

import { courierLabels, orderStageLabels } from '../order-labels';
import { OrderItems } from './order-items';
import { OrderRiskBadge } from './order-risk-badge';
import { OrderTimeline } from './order-timeline';
import { formatPhone } from '@/lib/format-phone';
import { useSessionContext } from '@/lib/session-context';

export type OrderDetailsProps = {
  order: OrderDetail;
  stageRef: RefObject<HTMLSpanElement | null>;
};

export function OrderDetails({ order, stageRef }: OrderDetailsProps) {
  return (
    <div className="space-y-6">
      <Badge
        ref={stageRef}
        tabIndex={-1}
        role="status"
        aria-label="Order stage"
        className="rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {orderStageLabels[order.stage]}
      </Badge>
      <OrderStageTracker currentStage={order.stage} />
      <DeliveryDetails order={order} />
      <ParcelDetails order={order} />
      <OrderItems order={order} />
      <OrderTimeline timeline={order.timeline} />
    </div>
  );
}

type OrderStageTrackerProps = { currentStage: OrderDetail['stage'] };

function OrderStageTracker({ currentStage }: OrderStageTrackerProps) {
  const steps: { stage: OrderDetail['stage']; label: string }[] = [
    { stage: 'to_confirm', label: 'To confirm' },
    { stage: 'to_pack', label: 'To pack' },
    { stage: 'with_courier', label: 'With courier' },
    { stage: 'delivered', label: 'Delivered' },
  ];
  return (
    <div className="border-b border-border pb-3">
      <div className="grid grid-cols-4 gap-1 text-center text-xs">
        {steps.map(({ stage, label }) => {
          const isCurrent = currentStage === stage;
          return (
            <div key={stage} className="flex flex-col items-center">
              <span
                className={cn(
                  'truncate font-medium',
                  isCurrent ? 'font-semibold text-text' : 'text-text-muted',
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  'mt-1.5 h-1 w-full rounded-full transition-colors',
                  isCurrent ? 'bg-primary' : 'bg-surface-muted',
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type DeliveryDetailsProps = { order: OrderDetail };

function DeliveryDetails({ order }: DeliveryDetailsProps) {
  const isHighRisk = order.returnRisk === 'high';
  const showAdvanceWarning =
    isHighRisk &&
    order.advancePaidPoisha === 0 &&
    ['to_confirm', 'on_hold', 'to_pack'].includes(order.stage);

  return (
    <section aria-label="Delivery details" className="space-y-2">
      <h3 className="text-sm font-semibold text-text">Delivery details</h3>
      <div>
        <p className="font-semibold wrap-anywhere text-text">{order.recipientName}</p>
        <p className="text-sm text-text-muted">{formatPhone(order.recipientPhone)}</p>
      </div>
      <OrderRiskBadge risk={order.returnRisk} />
      {showAdvanceWarning && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-xs text-danger">
          <p className="font-medium">Ask for a small advance first</p>
          <p className="mt-0.5 text-text-muted">These customers returned most past parcels.</p>
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
          >
            <div className="h-full w-3/5 rounded-full bg-danger" />
          </div>
        </div>
      )}
      <p className="text-sm wrap-anywhere text-text-muted">
        {order.recipientAddress}, {order.recipientDistrict}
      </p>
      <BuyerDetails order={order} />
      {order.hasRecipientPhoneMatch && (
        <p className="mt-2 text-sm text-warning">
          The delivery phone may match another customer profile.
        </p>
      )}
    </section>
  );
}

type ParcelDetailsProps = { order: OrderDetail };

function ParcelDetails({ order }: ParcelDetailsProps) {
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

type BuyerDetailsProps = { order: OrderDetail };

function BuyerDetails({ order }: BuyerDetailsProps) {
  const { data } = useSessionContext();
  const canOpenBuyer = data?.currentStore?.canViewCustomers && order.buyerContactId;
  return (
    <p className="mt-2 wrap-anywhere text-text-muted">
      Buyer {order.buyerName ?? 'Unnamed customer'}{' '}
      {canOpenBuyer && (
        <Link
          className="inline-flex min-h-11 min-w-11 items-center text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-10 sm:min-w-10"
          href={`/customers/${order.buyerContactId}`}
        >
          Open profile
        </Link>
      )}
    </p>
  );
}
