import JsBarcode from 'jsbarcode';
import { useLayoutEffect, useRef } from 'react';

import { formatMoney } from '@dakly/contracts/money';
import type { OrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import { cn } from '@dakly/ui/cn';

import { formatPhone } from '@/lib/format-phone';

type OrderShippingLabelProps = {
  store: OrderShippingLabels['store'];
  label: OrderShippingLabels['labels'][number];
};

export function OrderShippingLabel({ store, label }: OrderShippingLabelProps) {
  const barcode = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    if (barcode.current)
      JsBarcode(barcode.current, String(label.number), {
        format: 'CODE128',
        displayValue: false,
        lineColor: 'currentColor',
        background: 'transparent',
        height: 42,
        margin: 0,
        marginLeft: 20,
        marginRight: 20,
      });
  }, [label.number]);
  const textLength =
    store.name.length +
    label.recipientName.length +
    (label.recipientAddress?.length ?? 0) +
    (label.recipientDistrict?.length ?? 0);
  return (
    <article
      className={cn(
        'shipping-label mx-auto flex min-h-[136mm] w-full max-w-[100mm] flex-col gap-4 rounded-lg border border-border bg-surface p-5 wrap-anywhere print:m-0 print:h-[149mm] print:min-h-0 print:max-w-none print:rounded-none print:border-0 print:p-[6mm]',
        textLength > 270 && 'shipping-label-long-address',
      )}
    >
      <header className="border-b border-border pb-4">
        <p className="text-xs font-medium text-text-muted print:text-text">From</p>
        <p className="text-lg font-semibold">{store.name}</p>
        {store.phone ? <p className="text-sm">{formatPhone(store.phone)}</p> : null}
      </header>
      <ShippingLabelRecipient label={label} />
      <footer className="mt-auto space-y-3">
        <div className="shipping-label-payment flex items-center justify-between gap-2 border-y border-border py-3">
          <p className="text-sm">
            {label.itemCount} {label.itemCount === 1 ? 'item' : 'items'}
          </p>
          <div className="text-right">
            {label.codDuePoisha > 0 ? (
              <p className="text-xs font-medium text-text-muted print:text-text">COD</p>
            ) : null}
            <p className="shipping-label-amount text-2xl font-bold tabular-nums">
              {label.codDuePoisha > 0 ? formatMoney(label.codDuePoisha) : 'Paid'}
            </p>
          </div>
        </div>
        <div className="grid place-items-center gap-1 rounded-md border border-border px-2 py-3">
          <svg
            ref={barcode}
            role="img"
            aria-label={`Order ${label.number} barcode`}
            className="h-auto max-w-full text-text"
          />
          <h2 className="text-base font-semibold">Order #{label.number}</h2>
        </div>
      </footer>
    </article>
  );
}

function ShippingLabelRecipient({ label }: Pick<OrderShippingLabelProps, 'label'>) {
  return (
    <section>
      <p className="text-xs font-medium text-text-muted print:text-text">Deliver to</p>
      <p className="text-xl font-semibold">{label.recipientName}</p>
      {label.recipientPhone ? (
        <p className="text-base font-medium">{formatPhone(label.recipientPhone)}</p>
      ) : null}
      {label.recipientAddress ? (
        <p className="text-sm whitespace-pre-line print:whitespace-normal">
          {label.recipientAddress}
        </p>
      ) : null}
      {label.recipientDistrict ? <p className="text-sm">{label.recipientDistrict}</p> : null}
    </section>
  );
}
