import { MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import type { RefObject } from 'react';

import type { OrderDetail } from '@dakly/contracts/orders';
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
      <OrderStageTracker currentStage={order.stage} stageRef={stageRef} />
      <DeliveryDetails order={order} />
      <ParcelDetails order={order} />
      <OrderItems order={order} />
      <OrderTimeline timeline={order.timeline} />
    </div>
  );
}

const trackerMilestones = ['Inquiry', 'Confirmed', 'Packed', 'With courier', 'Delivered'] as const;

function milestoneStep(stage: OrderDetail['stage']): number {
  switch (stage) {
    case 'to_confirm':
    case 'on_hold':
      return 1;
    case 'to_pack':
      return 2;
    case 'with_courier':
      return 4;
    case 'delivered':
    case 'partially_delivered':
      return 5;
    default:
      return 1;
  }
}

function milestoneLabelClass(isCurrent: boolean, isReached: boolean): string {
  if (isCurrent) return 'font-semibold text-text';
  if (isReached) return 'font-medium text-text';
  return 'text-text-muted';
}

type OrderStageTrackerProps = {
  currentStage: OrderDetail['stage'];
  stageRef: RefObject<HTMLSpanElement | null>;
};

function OrderStageTracker({ currentStage, stageRef }: OrderStageTrackerProps) {
  const currentStep = milestoneStep(currentStage);
  return (
    <div className="space-y-2 border-b border-border pb-4">
      <span
        ref={stageRef}
        tabIndex={-1}
        role="status"
        aria-label="Order stage"
        className="sr-only focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {orderStageLabels[currentStage]}
      </span>
      <div className="grid grid-cols-5 gap-1.5">
        {trackerMilestones.map((milestone, index) => {
          const isReached = index + 1 <= currentStep;
          const isCurrent = index + 1 === currentStep;
          return (
            <div key={milestone} className="space-y-1.5 text-center">
              <div
                aria-hidden="true"
                className={cn(
                  'h-1 w-full rounded-full',
                  isReached ? 'bg-success' : 'bg-surface-muted',
                )}
              />
              <span
                className={cn(
                  'block text-xs leading-tight',
                  milestoneLabelClass(isCurrent, isReached),
                )}
              >
                {milestone}
              </span>
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
    <section aria-label="Delivery details" className="space-y-3">
      <h3 className="text-sm font-semibold text-text">Delivery details</h3>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold wrap-anywhere text-text">{order.recipientName}</p>
          <p className="text-sm text-text-muted">{formatPhone(order.recipientPhone)}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`tel:${order.recipientPhone}`}
            tabIndex={-1}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-8"
          >
            <Phone size={13} aria-hidden="true" />
            Call
          </a>
          <a
            href={`https://wa.me/880${order.recipientPhone.replace(/^0/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-8"
          >
            <MessageSquare size={13} aria-hidden="true" />
            WhatsApp
          </a>
        </div>
      </div>
      <p className="text-sm wrap-anywhere text-text-muted">
        {order.recipientAddress}, {order.recipientDistrict}
      </p>
      <BuyerDetails order={order} />
      <RiskBlock order={order} showAdvanceWarning={showAdvanceWarning} />
      {order.hasRecipientPhoneMatch && (
        <p className="mt-1 text-sm text-warning">
          The delivery phone may match another customer profile.
        </p>
      )}
    </section>
  );
}

type RiskBlockProps = {
  order: OrderDetail;
  showAdvanceWarning: boolean;
};

function RiskBlock({ order, showAdvanceWarning }: RiskBlockProps) {
  if (order.returnRisk === null) return null;
  if (!showAdvanceWarning) {
    return (
      <div>
        <OrderRiskBadge risk={order.returnRisk} />
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-lg bg-surface-muted/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <OrderRiskBadge risk={order.returnRisk} />
        <span className="text-text-muted">Ask for a small advance first</span>
      </div>
      <div aria-hidden="true" className="h-1 w-1/2 overflow-hidden rounded-full bg-border">
        <div className="h-full w-3/5 rounded-full bg-danger" />
      </div>
    </div>
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
  if (!order.buyerName || order.buyerName === order.recipientName) return null;
  return (
    <p className="mt-1 text-xs wrap-anywhere text-text-muted">
      Buyer {order.buyerName}{' '}
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
