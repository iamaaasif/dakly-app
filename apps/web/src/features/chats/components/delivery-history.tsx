import type { OrderStage } from '@dakly/contracts/orders';

import { useContactOrders } from '../api/chat-contact';

const stageLabels: Record<OrderStage, string> = {
  to_confirm: 'To confirm',
  on_hold: 'On hold',
  to_pack: 'To pack',
  with_courier: 'With courier',
  delivered: 'Delivered',
  partially_delivered: 'Partly delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export function DeliveryHistory({ contactId }: { contactId: string }) {
  const orders = useContactOrders(contactId);
  if (!orders.data) return null;
  const { items } = orders.data;
  return (
    <div className="rounded-lg bg-surface-muted p-3">
      <p className="font-semibold">{items.length ? 'Delivery history' : 'New customer'}</p>
      {items.length ? (
        <ul className="mt-1 space-y-1">
          {items.map((order) => (
            <li key={order.id} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                #{order.number} {order.itemPreview ?? order.recipientName}
              </span>
              <span className="shrink-0 text-text-muted">{stageLabels[order.stage]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted">No delivery history yet.</p>
      )}
    </div>
  );
}
