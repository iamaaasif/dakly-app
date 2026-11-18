import { useContext, useRef, type RefObject } from 'react';

import type { OrderDetail } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useOrder } from '../api/get-order';
import { canConfirmOrder } from '../order-actions';
import { orderSourceLabels } from '../order-labels';
import { OrderDetails } from './order-details';
import { SessionInteraction } from '@/components/session-interaction';
import { formatDateTime, formatRelativeTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

type OrderDetailSheetProps = { id: string } & Pick<SheetProps, 'onClose' | 'fallbackFocus'>;

export function OrderDetailSheet({ id, onClose, fallbackFocus }: OrderDetailSheetProps) {
  const query = useOrder(id);
  const order = query.data;
  const blocked = useContext(SessionInteraction);
  const { data } = useSessionContext();
  const transition = useOrderStage(id);
  const stage = useRef<HTMLSpanElement>(null);

  return (
    <Sheet
      title={order ? `Order #${order.number}` : 'Order details'}
      description={order && <OrderDescription order={order} />}
      open={!blocked}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
      footer={
        canConfirmOrder(order, data?.currentStore?.canEditOrders) && (
          <ConfirmOrderFooter transition={transition} stage={stage} />
        )
      }
    >
      {query.isPending ? <p role="status">Loading order…</p> : null}
      {query.error ? (
        <QueryError
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retryLabel="Retry order"
        />
      ) : null}
      {order ? <OrderDetails order={order} stageRef={stage} /> : null}
    </Sheet>
  );
}

function OrderDescription({ order }: { order: OrderDetail }) {
  return (
    <>
      {orderSourceLabels[order.source]} ·{' '}
      <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
        {formatRelativeTime(order.createdAt)}
      </time>
    </>
  );
}

function ConfirmOrderFooter({
  transition,
  stage,
}: {
  transition: ReturnType<typeof useOrderStage>;
  stage: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <>
      {transition.error && (
        <p role="alert" className="mb-2 text-danger">
          {transition.error.message}
        </p>
      )}
      <Button
        className="w-full"
        disabled={transition.isPending}
        onClick={(event) => {
          const button = event.currentTarget;
          const drawer = button.closest('[role="dialog"]');
          transition.mutate(
            { to: 'to_pack' },
            {
              onSuccess: () => {
                const focused = document.activeElement;
                if (focused === button || focused === drawer || focused === document.body)
                  stage.current?.focus();
              },
            },
          );
        }}
      >
        Mark confirmed
      </Button>
    </>
  );
}
