'use client';

import { QueryError } from '@dakly/ui/query-error';
import { Sheet } from '@dakly/ui/sheet';

import { useOrder } from '../api/orders';
import { OrderDetails } from './order-details';

type OrderDetailSheetProps = { id: string; onClose: () => void };

export function OrderDetailSheet({ id, onClose }: OrderDetailSheetProps) {
  const query = useOrder(id);

  return (
    <Sheet
      title={query.data ? `Order #${query.data.number}` : 'Order details'}
      open
      onClose={onClose}
    >
      {query.isPending ? <p role="status">Loading order…</p> : null}
      {query.error ? (
        <QueryError
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retryLabel="Retry order"
        />
      ) : null}
      {query.data ? <OrderDetails order={query.data} /> : null}
    </Sheet>
  );
}
