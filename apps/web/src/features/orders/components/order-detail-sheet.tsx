import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrder } from '../api/get-order';
import { OrderDetails } from './order-details';

type OrderDetailSheetProps = { id: string } & Pick<SheetProps, 'onClose' | 'fallbackFocus'>;

export function OrderDetailSheet({ id, onClose, fallbackFocus }: OrderDetailSheetProps) {
  const query = useOrder(id);

  return (
    <Sheet
      title={query.data ? `Order #${query.data.number}` : 'Order details'}
      open
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
