'use client';

import { Printer } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderInvoice } from '../api/get-order-invoice';
import { OrderInvoiceDocument } from './order-invoice';
import { SessionVerificationStatus } from '@/components/session-verification-status';
import { useSessionBoundary } from '@/lib/use-session-boundary';

export function OrderInvoiceScreen({ orderId }: { orderId: string }) {
  const boundary = useSessionBoundary();
  const { data, error, isPending } = boundary.session;
  const printed = useRef(false);
  if (isPending)
    return (
      <p role="status" className="p-6">
        Loading invoice…
      </p>
    );
  if (boundary.blocked || error)
    return (
      <SessionVerificationStatus
        expired={boundary.expired}
        failure={boundary.failure}
        error={error}
        onRetry={boundary.verify}
      />
    );
  if (!data?.currentStore?.canViewOrders)
    return (
      <p role="alert" className="p-6">
        You do not have Orders access in this shop.
      </p>
    );
  return <VerifiedOrderInvoice orderId={orderId} printed={printed} />;
}

type VerifiedOrderInvoiceProps = { orderId: string; printed: RefObject<boolean> };

function VerifiedOrderInvoice({ orderId, printed }: VerifiedOrderInvoiceProps) {
  const query = useOrderInvoice(orderId);
  usePrintFromDrawer(query.isSuccess, printed);
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

function usePrintFromDrawer(ready: boolean, printed: RefObject<boolean>) {
  useEffect(() => {
    if (!ready || printed.current || window.location.hash !== '#print') return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled || printed.current) return;
      printed.current = true;
      window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, printed]);
}
