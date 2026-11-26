'use client';

import { Printer } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useOrderInvoice } from '../api/get-order-invoice';
import { OrderInvoiceDocument } from './order-invoice';
import { SessionVerificationStatus } from '@/components/session-verification-status';
import { useSessionBoundary } from '@/lib/use-session-boundary';

export function OrderInvoiceScreen({ orderId }: { orderId: string }) {
  const boundary = useSessionBoundary();
  const { error, isPending } = boundary.session;
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
  return <VerifiedOrderInvoice orderId={orderId} />;
}

function VerifiedOrderInvoice({ orderId }: { orderId: string }) {
  const printed = useRef(false);
  const query = useOrderInvoice(orderId);
  useEffect(() => {
    if (!query.isSuccess || printed.current || window.location.hash !== '#print') return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled || printed.current) return;
      printed.current = true;
      window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [query.isSuccess]);
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
