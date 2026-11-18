import { useContext } from 'react';

import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrder } from '../api/get-order';
import { OrderDetails } from './order-details';
import { SessionInteraction } from '@/components/session-interaction';

type OrderDetailSheetProps = { id: string } & Pick<SheetProps, 'onClose' | 'fallbackFocus'>;

export function OrderDetailSheet({ id, onClose, fallbackFocus }: OrderDetailSheetProps) {
  const query = useOrder(id);
  const blocked = useContext(SessionInteraction);

  return (
    <Sheet
      title={query.data ? `Order #${query.data.number}` : 'Order details'}
      open={!blocked}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
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
