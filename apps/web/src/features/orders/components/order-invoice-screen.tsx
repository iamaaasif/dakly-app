'use client';

import { Printer } from 'lucide-react';
import { useRef, type RefObject } from 'react';

import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderInvoice } from '../api/get-order-invoice';
import { OrderInvoiceDocument } from './order-invoice';
import { OrderPrintAccess, usePrintWhenReady } from './order-print';

export function OrderInvoiceScreen({ orderId }: { orderId: string }) {
  const printed = useRef(false);
  return (
    <OrderPrintAccess loadingMessage="Loading invoice…">
      <VerifiedOrderInvoice orderId={orderId} printed={printed} />
    </OrderPrintAccess>
  );
}

type VerifiedOrderInvoiceProps = { orderId: string; printed: RefObject<boolean> };

function VerifiedOrderInvoice({ orderId, printed }: VerifiedOrderInvoiceProps) {
  const query = useOrderInvoice(orderId);
  usePrintWhenReady(query.isSuccess, printed);
  if (query.error)
    return (
      <main className="p-6">
        <QueryError
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retryLabel="Retry invoice"
        />
      </main>
    );
  if (!query.data)
    return (
      <p role="status" className="p-6">
        Loading invoice…
      </p>
    );

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8 print:max-w-none print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <Button
          variant="secondary"
          onClick={() => {
            printed.current = true;
            window.print();
          }}
        >
          <Printer size={16} aria-hidden="true" />
          Print invoice
        </Button>
      </div>
      <OrderInvoiceDocument invoice={query.data} />
    </main>
  );
}
