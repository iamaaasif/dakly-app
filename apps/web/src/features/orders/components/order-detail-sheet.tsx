import { useContext, useRef, useState, type RefObject } from 'react';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useOrder } from '../api/get-order';
import { canConfirmOrder } from '../order-actions';
import { orderSourceLabels } from '../order-labels';
import { OrderDetails } from './order-details';
import {
  OrderStageActions,
  orderStageActions,
  type StageAction,
  type StageFormAction,
} from './order-stage-actions';
import { OrderStageDialog } from './order-stage-dialog';
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
  const canEdit = data?.currentStore?.canEditOrders;
  const canConfirm = canConfirmOrder(order, canEdit);
  const actions = orderStageActions(order, canEdit);
  const form = useStageForm(actions, stage);

  return (
    <>
      <Sheet
        {...orderHeading(order)}
        open={!blocked && !form.action}
        onClose={onClose}
        onOpenAutoFocus={form.restoreFocus}
        fallbackFocus={fallbackFocus}
        footer={
          (canConfirm || actions.length > 0) && (
            <OrderStageFooter {...{ transition, stage, canConfirm, actions }} onForm={form.open} />
          )
        }
      >
        <OrderDetailContent query={query} stage={stage} />
      </Sheet>
      {form.action && order && (
        <OrderStageDialog order={order} action={form.action} onClose={form.close} />
      )}
    </>
  );
}

function useStageForm(actions: readonly StageAction[], stage: RefObject<HTMLSpanElement | null>) {
  const [action, setAction] = useState<StageFormAction>();
  const previous = useRef<StageFormAction | undefined>(undefined);

  function open(next: StageFormAction) {
    previous.current = next;
    setAction(next);
  }

  function restoreFocus(event: Event) {
    const previousAction = previous.current;
    if (!previousAction) return;
    previous.current = undefined;
    const drawer = stage.current?.closest('[role="dialog"]');
    const target =
      drawer?.querySelector<HTMLButtonElement>(`[data-order-action="${previousAction}"]`) ??
      stage.current;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  return {
    action: action && actions.includes(action) ? action : undefined,
    open,
    close: () => setAction(undefined),
    restoreFocus,
  };
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
  transition: ReturnType<typeof useOrderStage>;
  stage: RefObject<HTMLSpanElement | null>;
  canConfirm: boolean;
  actions: readonly StageAction[];
  onForm: (action: StageFormAction) => void;
};

function OrderStageFooter({
  transition,
  stage,
  canConfirm,
  actions,
  onForm,
}: OrderStageFooterProps) {
  function changeStage(change: OrderStageChange, button: HTMLButtonElement) {
    const drawer = button.closest('[role="dialog"]');
    transition.mutate(change, {
      onSuccess: () => {
        const focused = document.activeElement;
        if (focused === button || focused === drawer || focused === document.body)
          stage.current?.focus();
      },
    });
  }

  return (
    <>
      {transition.error && (
        <p role="alert" className="mb-2 text-danger">
          {transition.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <Button
            className="w-full"
            disabled={transition.isPending}
            onClick={(event) => changeStage({ to: 'to_pack' }, event.currentTarget)}
          >
            Mark confirmed
          </Button>
        )}
        <OrderStageActions
          actions={actions}
          pending={transition.isPending}
          hasPrimary={canConfirm}
          onChange={changeStage}
          onForm={onForm}
        />
      </div>
    </>
  );
}
