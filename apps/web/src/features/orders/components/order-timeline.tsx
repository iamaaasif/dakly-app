import type { OrderStageHistoryEntry } from '@dakly/contracts/orders';

import { orderStageLabels } from '../order-labels';
import { formatDateTime } from '@/lib/format-date';

export function OrderTimeline({ timeline }: { timeline: OrderStageHistoryEntry[] }) {
  return (
    <section aria-label="Order history">
      <h3 className="text-md font-semibold">Order history</h3>
      {timeline.length ? (
        <ol className="divide-y divide-border">
          {timeline.map((event) => (
            <li key={event.id} className="py-2 text-sm">
              <p>
                {orderStageLabels[event.from]} → {orderStageLabels[event.to]}
              </p>
              {event.reason && (
                <p className="wrap-anywhere">
                  {['on_hold', 'cancelled'].includes(event.to)
                    ? event.reason.replaceAll('_', ' ')
                    : event.reason}
                </p>
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
