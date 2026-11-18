import type { OrderDetail } from '@dakly/contracts/orders';

import { formatMoney } from '@/lib/format-money';

export function OrderItems({ order }: { order: OrderDetail }) {
  const subtotal = order.deliveredItemsSubtotalPoisha ?? order.itemsSubtotalPoisha;
  const discount = order.deliveredOrderDiscountPoisha ?? order.orderDiscountPoisha;
  const total = BigInt(subtotal) + BigInt(order.deliveryChargePoisha) - BigInt(discount);
  return (
    <section aria-label="Items">
      <h3 className="text-md font-semibold">Items</h3>
      <ul className="divide-y divide-border">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-2 text-sm">
            <span className="min-w-0 wrap-anywhere">
              {item.productName}
              {item.variantTitle === 'Default' ? '' : ` · ${item.variantTitle}`}
              {item.deliveredQuantity === null
                ? ` × ${item.quantity}`
                : ` · ${item.deliveredQuantity} of ${item.quantity} delivered`}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(item.unitPricePoisha)} each</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 border-t border-border pt-3 text-sm tabular-nums">
        {order.deliveredItemsSubtotalPoisha !== null && (
          <PriceLine label="Ordered items" amount={order.itemsSubtotalPoisha} />
        )}
        <PriceLine
          label={order.deliveredItemsSubtotalPoisha === null ? 'Items subtotal' : 'Delivered items'}
          amount={subtotal}
        />
        <PriceLine label="Delivery" amount={order.deliveryChargePoisha} />
        {discount > 0 && <PriceLine label="Discount" amount={-discount} />}
        <PriceLine label="Total" amount={total} />
        <PriceLine label="Advance paid" amount={order.advancePaidPoisha} />
        <PriceLine label="COD amount" amount={order.codAmountPoisha} />
        {order.codCollectedPoisha !== null && (
          <PriceLine label="COD received" amount={order.codCollectedPoisha} />
        )}
      </dl>
      {order.paymentStatus === 'refund_due' && <p className="text-warning">Refund due</p>}
    </section>
  );
}

function PriceLine({ label, amount }: { label: string; amount: number | bigint }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{formatMoney(amount)}</dd>
    </div>
  );
}
