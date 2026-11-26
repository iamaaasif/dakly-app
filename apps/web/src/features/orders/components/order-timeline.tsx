import type { OrderDetail, OrderStageHistoryEntry } from '@dakly/contracts/orders';

import { cancelReasonLabels, onHoldReasonLabels, orderStageLabels } from '../order-labels';
import { formatDateTime } from '@/lib/format-date';

export function OrderTimeline({ timeline }: { timeline: OrderDetail['timeline'] }) {
  return (
    <section aria-label="Order history">
      <h3 className="text-md font-semibold">Order history</h3>
      {timeline.length ? (
        <ol className="divide-y divide-border">
          {timeline.map((event) => (
            <li key={event.id} className="py-2 text-sm">
              {'from' in event ? (
                <>
                  <p>
                    {orderStageLabels[event.from]} → {orderStageLabels[event.to]}
                  </p>
                  {event.reason && <p className="wrap-anywhere">{timelineReason(event)}</p>}
                </>
              ) : (
                <p>{event.reason}</p>
              )}
              <time dateTime={event.occurredAt} className="text-xs text-text-muted">
                {formatDateTime(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-text-muted">No stage changes yet.</p>
      )}
    </section>
  );
}

const reasonLabels: Partial<Record<OrderStageHistoryEntry['to'], Partial<Record<string, string>>>> =
  {
    on_hold: onHoldReasonLabels,
    cancelled: cancelReasonLabels,
  };

function timelineReason({ to, reason }: OrderStageHistoryEntry) {
  const labels = reasonLabels[to];
  return labels && reason && Object.hasOwn(labels, reason) ? labels[reason] : reason;
}
