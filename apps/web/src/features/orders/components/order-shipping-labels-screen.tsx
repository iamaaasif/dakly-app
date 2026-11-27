'use client';

import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

import { shippingLabelsPhoneRequired } from '@dakly/contracts/order-shipping-labels';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderShippingLabels } from '../api/get-order-shipping-labels';
import { OrderPrintSession, usePrintWhenReady } from './order-print';
import { OrderShippingLabel } from './order-shipping-label';
import { useSessionContext } from '@/lib/session-context';

const loadingMessage = 'Loading shipping labels…';
type LabelBatchProps = { orderIds: string[] };

export function OrderShippingLabelsScreen({ orderIds }: LabelBatchProps) {
  const { data } = useSessionContext();
  const store = data?.currentStore;
  return (
    <OrderPrintSession loadingMessage={loadingMessage}>
      {store?.canViewOrders && !store.canPrintShippingLabels ? (
        <p className="p-6">{shippingLabelsPhoneRequired}</p>
      ) : (
        <VerifiedShippingLabels orderIds={orderIds} />
      )}
    </OrderPrintSession>
  );
}

function VerifiedShippingLabels({ orderIds }: LabelBatchProps) {
  const printed = useRef(false);
  const query = useOrderShippingLabels(orderIds);
  usePrintWhenReady(query.isSuccess, printed);
  if (query.error)
    return (
      <main className="space-y-3 p-6">
        <QueryError
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retryLabel="Retry shipping labels"
        />
        <Link href="/orders" className="inline-flex min-h-10 items-center text-action underline">
          Back to Orders
        </Link>
      </main>
    );
  if (!query.data)
    return (
      <p role="status" className="p-6">
        {loadingMessage}
      </p>
    );

  const { store, labels } = query.data;
  return (
    <main className="mx-auto max-w-md px-4 py-6 print:max-w-none print:p-0">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-lg font-semibold">Shipping labels ({labels.length})</h1>
        <Button
          variant="secondary"
          onClick={() => {
            printed.current = true;
            window.print();
          }}
        >
          <Printer size={16} aria-hidden="true" />
          Print shipping labels
        </Button>
      </header>
      <div className="space-y-4 print:space-y-0">
        {labels.map((label) => (
          <OrderShippingLabel key={label.id} store={store} label={label} />
        ))}
      </div>
    </main>
  );
}
