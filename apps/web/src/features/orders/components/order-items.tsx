import type { OrderDetail } from '@dakly/contracts/orders';

import { formatMoney } from '@/lib/format-money';

export function OrderItems({ order }: { order: OrderDetail }) {
  return (
    <section aria-label="Items">
      <h3 className="text-md font-semibold">Items</h3>
      <ul className="divide-y divide-border">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-2 text-sm">
            <span>
              {item.productName}
              {item.variantTitle === 'Default' ? '' : ` · ${item.variantTitle}`} × {item.quantity}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(item.unitPricePoisha)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t border-border pt-3 text-sm tabular-nums">
        <div className="flex justify-between">
          <dt>Delivery</dt>
          <dd>{formatMoney(order.deliveryChargePoisha)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Advance paid</dt>
          <dd>{formatMoney(order.advancePaidPoisha)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Cash on delivery</dt>
          <dd>{formatMoney(order.codAmountPoisha)}</dd>
        </div>
      </dl>
    </section>
  );
}
