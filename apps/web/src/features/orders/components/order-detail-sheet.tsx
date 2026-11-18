import { useContext, useRef, type RefObject } from 'react';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useOrder } from '../api/get-order';
import { canConfirmOrder } from '../order-actions';
import { orderSourceLabels } from '../order-labels';
import { OrderDetails } from './order-details';
import { orderStageActions, stageActionLabels, type StageAction } from './order-stage-actions';
import { OrderStageDialog } from './order-stage-dialog';
import { SessionInteraction } from '@/components/session-interaction';
import { formatDateTime, formatRelativeTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';

type OrderDetailSheetProps = { id: string } & Pick<SheetProps, 'onClose' | 'restoreFocusTo'>;

export function OrderDetailSheet({ id, onClose, restoreFocusTo }: OrderDetailSheetProps) {
  const query = useOrder(id);
  const order = query.data;
  const blocked = useContext(SessionInteraction);
  const { data } = useSessionContext();
  const transition = useOrderStage();
  const stage = useRef<HTMLSpanElement>(null);
  const canEdit = data?.currentStore?.canEditOrders;
  const canConfirm = canConfirmOrder(order, canEdit);
  const actions = orderStageActions(order, canEdit);

  return (
    <Sheet
      {...orderHeading(order)}
      open={!blocked}
      onClose={onClose}
      restoreFocusTo={restoreFocusTo}
      footer={
        order &&
        (canConfirm || actions.length > 0) && (
          <OrderStageFooter {...{ order, transition, stage, canConfirm, actions }} />
        )
      }
    >
      <OrderDetailContent query={query} stage={stage} />
    </Sheet>
  );
}

function OrderDetailContent({
  query,
  stage,
}: {
  query: ReturnType<typeof useOrder>;
  stage: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <>
      {query.isPending ? <p role="status">Loading order…</p> : null}
      {query.error ? (
        <QueryError
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retryLabel="Retry order"
        />
      ) : null}
      {query.data ? <OrderDetails order={query.data} stageRef={stage} /> : null}
    </>
  );
}

function orderHeading(order?: OrderDetail): Pick<SheetProps, 'title' | 'description'> {
  if (!order) return { title: 'Order details' };
  return {
    title: `Order #${order.number}`,
    description: (
      <>
        {orderSourceLabels[order.source]} ·{' '}
        <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
          {formatRelativeTime(order.createdAt)}
        </time>
      </>
    ),
  };
}

type OrderStageFooterProps = {
  order: OrderDetail;
  transition: ReturnType<typeof useOrderStage>;
  stage: RefObject<HTMLSpanElement | null>;
  canConfirm: boolean;
  actions: readonly StageAction[];
};

function OrderStageFooter({
  order,
  transition,
  stage,
  canConfirm,
  actions,
}: OrderStageFooterProps) {
  function changeStage(change: OrderStageChange, button: HTMLButtonElement) {
    const drawer = button.closest('[role="dialog"]');
    transition.mutate(
      { id: order.id, body: change },
      {
        onSuccess: () => {
          const focused = document.activeElement;
          if (focused === button || focused === drawer || focused === document.body)
            stage.current?.focus();
        },
      },
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {transition.error && (
        <p role="alert" className="w-full text-danger">
          {transition.error.message}
        </p>
      )}
      {canConfirm && (
        <Button
          className="w-full"
          disabled={transition.isPending}
          onClick={(event) => changeStage({ to: 'to_pack' }, event.currentTarget)}
        >
          Mark confirmed
        </Button>
      )}
      {actions.map((action, index) =>
        action === 'to_confirm' || action === 'delivered' ? (
          <Button
            key={action}
            variant={!canConfirm && index === 0 ? 'primary' : 'secondary'}
            disabled={transition.isPending}
            onClick={(event) => changeStage({ to: action }, event.currentTarget)}
          >
            {stageActionLabels[action]}
          </Button>
        ) : (
          <OrderStageDialog
            key={action}
            order={order}
            action={action}
            stage={stage}
            primary={!canConfirm && index === 0}
            disabled={transition.isPending}
          />
        ),
      )}
    </div>
  );
}
