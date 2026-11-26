import { formatMoney } from '@dakly/contracts/money';
import type { OrderInvoice } from '@dakly/contracts/order-invoice';

import { formatCalendarDate } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';

export function OrderInvoiceDocument({ invoice }: { invoice: OrderInvoice }) {
  const { store } = invoice;
  return (
    <article className="order-invoice rounded-xl space-y-6 border border-border bg-surface p-4 sm:p-8 print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-b border-border pb-5 wrap-anywhere">
        <div>
          <p className="text-lg font-semibold">{store.name}</p>
          {store.phone ? <p className="text-sm">{formatPhone(store.phone)}</p> : null}
        </div>
        <div className="sm:text-right">
          <h1 className="text-xl font-semibold">Invoice #{invoice.number}</h1>
          <time className="text-sm" dateTime={invoice.createdAt}>
            {formatCalendarDate(invoice.createdAt, store.timeZone)}
          </time>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm wrap-anywhere print:break-inside-avoid">
        <div>
          <dt className="font-semibold">Buyer</dt>
          <dd>{invoice.buyerName ?? '—'}</dd>
        </div>
        <div>
          <dt className="font-semibold">Delivery recipient</dt>
          <dd>
            <p>{invoice.recipientName}</p>
            {invoice.recipientPhone ? <p>{formatPhone(invoice.recipientPhone)}</p> : null}
            {invoice.recipientAddress ? (
              <p className="whitespace-pre-line">{invoice.recipientAddress}</p>
            ) : null}
            {invoice.recipientDistrict ? <p>{invoice.recipientDistrict}</p> : null}
          </dd>
        </div>
      </dl>

      <InvoiceItems invoice={invoice} />

      <dl className="ml-auto max-w-xs space-y-2 text-sm tabular-nums print:break-inside-avoid">
        <InvoiceAmount label="Items subtotal" amount={invoice.itemsSubtotalPoisha} />
        <InvoiceAmount label="Delivery charge" amount={invoice.deliveryChargePoisha} />
        <InvoiceAmount label="Order discount" amount={-invoice.orderDiscountPoisha} />
        <InvoiceAmount label="Advance paid" amount={-invoice.advancePaidPoisha} />
        <div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-semibold">
          <dt>COD to collect</dt>
          <dd className="text-right wrap-anywhere">{formatMoney(invoice.codAmountPoisha)}</dd>
        </div>
      </dl>
    </article>
  );
}

function InvoiceItems({ invoice }: { invoice: OrderInvoice }) {
  return (
    <section aria-labelledby="invoice-items">
      <h2 id="invoice-items" className="pb-2 text-sm font-semibold">
        {invoice.isPartialDelivery ? 'Delivered items' : 'Items'}
      </h2>
      <table className="w-full table-fixed border-collapse text-sm wrap-anywhere tabular-nums">
        <thead className="border-y border-border bg-surface-muted print:table-header-group print:bg-transparent">
          <tr>
            <th className="py-2 text-left font-medium" scope="col">
              Item
            </th>
            <th className="w-10 py-2 text-right font-medium sm:w-20" scope="col">
              Qty
            </th>
            <th className="w-18 py-2 text-right font-medium sm:w-28" scope="col">
              Unit price
            </th>
            <th className="w-18 py-2 text-right font-medium sm:w-28" scope="col">
              Line discount
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b border-border align-top print:break-inside-avoid">
              <th scope="row" className="py-3 pr-2 text-left font-medium">
                {item.productName}
                {item.variantTitle === 'Default' ? null : (
                  <span className="block text-text-muted">{item.variantTitle}</span>
                )}
              </th>
              <td className="py-3 text-right">{item.quantity}</td>
              <td className="py-3 pl-2 text-right">{formatMoney(item.unitPricePoisha)}</td>
              <td className="py-3 pl-2 text-right">{formatMoney(-item.lineDiscountPoisha)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function InvoiceAmount({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-right wrap-anywhere">{formatMoney(amount)}</dd>
    </div>
  );
}
