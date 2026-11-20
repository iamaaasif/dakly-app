import { formatMoney } from '@dakly/contracts/money';
import type { OrderDetail } from '@dakly/contracts/orders';
import { cn } from '@dakly/ui/cn';

export type OrderItemsProps = { order: OrderDetail };

export function OrderItems({ order }: OrderItemsProps) {
  const subtotal = order.deliveredItemsSubtotalPoisha ?? order.itemsSubtotalPoisha;
  const discount = order.deliveredOrderDiscountPoisha ?? order.orderDiscountPoisha;
  return (
    <section aria-label="Items">
      <h3 className="text-sm font-semibold text-text">Items</h3>
      <ul className="divide-y divide-border">
        {order.items.map((item) => {
          const lineDiscount = item.deliveredLineDiscountPoisha ?? item.lineDiscountPoisha;
          return (
            <li key={item.id} className="flex justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 wrap-anywhere">
                {item.productName}
                {item.variantTitle === 'Default' ? '' : ` · ${item.variantTitle}`}
                {item.deliveredQuantity === null
                  ? ` × ${item.quantity}`
                  : ` · ${item.deliveredQuantity} of ${item.quantity} delivered`}
              </span>
              <div className="shrink-0 text-right tabular-nums">
                <span>{formatMoney(item.unitPricePoisha)} each</span>
                {lineDiscount > 0 && (
                  <p className="text-text-muted">Line discount {formatMoney(-lineDiscount)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="space-y-1.5 border-t border-border pt-3 text-sm tabular-nums">
        {order.deliveredItemsSubtotalPoisha !== null && (
          <PriceLine label="Ordered items" amount={order.itemsSubtotalPoisha} />
        )}
        <PriceLine
          label={order.deliveredItemsSubtotalPoisha === null ? 'Items subtotal' : 'Delivered items'}
          amount={subtotal}
        />
        <PriceLine label="Delivery" amount={order.deliveryChargePoisha} />
        {discount > 0 && <PriceLine label="Discount" amount={-discount} />}
        <PriceLine label="Total" amount={order.totalPoisha} isBold />
        <PriceLine label="Advance paid" amount={order.advancePaidPoisha} />
        <PriceLine label="COD amount" amount={order.codAmountPoisha} isBold />
        {order.codCollectedPoisha !== null && (
          <PriceLine label="COD received" amount={order.codCollectedPoisha} isBold />
        )}
      </dl>
      {order.paymentStatus === 'refund_due' && <p className="text-warning">Refund due</p>}
    </section>
  );
}

type PriceLineProps = { label: string; amount: number; isBold?: boolean };

function PriceLine({ label, amount, isBold }: PriceLineProps) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className={isBold ? 'font-semibold text-text' : 'text-text-muted'}>{label}</dt>
      <dd className={cn('text-right tabular-nums', isBold && 'font-semibold text-text')}>
        {formatMoney(amount)}
      </dd>
    </div>
  );
}
