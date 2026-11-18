import { useContext, useRef, useState, type RefObject } from 'react';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useOrder } from '../api/get-order';
import { canConfirmOrder, canEditOrder } from '../order-actions';
import { orderSourceLabels } from '../order-labels';
import { OrderDetails } from './order-details';
import { OrderEditorDialog } from './order-editor-dialog';
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

type OrderDrawerAction = StageFormAction | 'edit';

type OrderDetailSheetProps = { id: string } & Pick<SheetProps, 'onClose' | 'fallbackFocus'>;

export function OrderDetailSheet({ id, onClose, fallbackFocus }: OrderDetailSheetProps) {
  const query = useOrder(id);
  const order = query.data;
  const blocked = useContext(SessionInteraction);
  const { data } = useSessionContext();
  const transition = useOrderStage();
  const stage = useRef<HTMLSpanElement>(null);
  const canEdit = data?.currentStore?.canEditOrders;
  const canConfirm = canConfirmOrder(order, canEdit);
  const actions = orderStageActions(order, canEdit);
  const editable = canEditOrder(order, canEdit);
  const form = useStageForm(actions, stage, editable);

  return (
    <>
      <Sheet
        {...orderHeading(order)}
        open={!blocked && !form.action}
        onClose={onClose}
        onOpenAutoFocus={form.restoreFocus}
        fallbackFocus={fallbackFocus}
        footer={
          canConfirm || actions.length || editable ? (
            <OrderStageFooter
              {...{ id, transition, stage, canConfirm, actions }}
              onForm={form.open}
              onEdit={editable ? () => form.open('edit') : undefined}
            />
          ) : undefined
        }
      >
        <OrderDetailContent query={query} stage={stage} />
      </Sheet>
      <OrderDrawerForm order={order} action={form.action} onClose={form.close} />
    </>
  );
}

function useStageForm(
  actions: readonly StageAction[],
  stage: RefObject<HTMLSpanElement | null>,
  editable: boolean,
) {
  const [action, setAction] = useState<OrderDrawerAction>();
  const previous = useRef<OrderDrawerAction | undefined>(undefined);

  function open(next: OrderDrawerAction) {
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
    action: availableOrderAction(action, actions, editable),
    open,
    close: () => setAction(undefined),
    restoreFocus,
  };
}

function availableOrderAction(
  action: OrderDrawerAction | undefined,
  allowed: readonly StageAction[],
  editable: boolean,
) {
  if (action === 'edit') return editable ? action : undefined;
  return action && allowed.includes(action) ? action : undefined;
}

type OrderDrawerFormProps = {
  order?: OrderDetail;
  action?: OrderDrawerAction;
  onClose: () => void;
};

function OrderDrawerForm({ order, action, onClose }: OrderDrawerFormProps) {
  if (!order || !action) return null;
  if (action === 'edit')
    return <OrderEditorDialog order={order} onClose={onClose} onSaved={onClose} />;
  return <OrderStageDialog order={order} action={action} onClose={onClose} />;
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
  id: string;
  transition: ReturnType<typeof useOrderStage>;
  stage: RefObject<HTMLSpanElement | null>;
  canConfirm: boolean;
  actions: readonly StageAction[];
  onForm: (action: StageFormAction) => void;
  onEdit?: () => void;
};

function OrderStageFooter({
  id,
  transition,
  stage,
  canConfirm,
  actions,
  onForm,
  onEdit,
}: OrderStageFooterProps) {
  function changeStage(change: OrderStageChange, button: HTMLButtonElement) {
    const drawer = button.closest('[role="dialog"]');
    transition.mutate(
      { id, body: change },
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
        {onEdit && (
          <Button
            data-order-action="edit"
            variant="secondary"
            onClick={onEdit}
            disabled={transition.isPending}
          >
            Edit order
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
