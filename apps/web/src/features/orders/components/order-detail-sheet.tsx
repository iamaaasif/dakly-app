import { useContext, useRef, type RefObject } from 'react';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useOrder } from '../api/get-order';
import { canConfirmOrder, canEditOrder } from '../order-actions';
import { orderSourceLabels } from '../order-labels';
import { EditOrderDialog } from './edit-order-dialog';
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
  const editable = canEditOrder(order, canEdit);
  const actions = orderStageActions(order, canEdit);

  return (
    <Sheet
      {...orderHeading(order)}
      open={!blocked}
      onClose={onClose}
      restoreFocusTo={restoreFocusTo}
      footer={
        order &&
        (canConfirm || actions.length > 0 || editable) && (
          <OrderStageFooter {...{ order, transition, stage, canConfirm, actions, editable }} />
        )
      }
    >
      <OrderDetailContent query={query} stage={stage} />
    </Sheet>
  );
}

type OrderDetailContentProps = {
  query: ReturnType<typeof useOrder>;
  stage: RefObject<HTMLSpanElement | null>;
};

function OrderDetailContent({ query, stage }: OrderDetailContentProps) {
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
  editable: boolean;
};

function OrderStageFooter(props: OrderStageFooterProps) {
  const { order, transition, stage, canConfirm, actions, editable } = props;
  const cancelAction = actions.find((a): a is 'cancelled' => a === 'cancelled');
  const otherActions = actions.filter((a) => a !== 'cancelled');

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
    <div className="flex w-full flex-col gap-2">
      {transition.error && (
        <p role="alert" className="w-full text-danger">
          {transition.error.message}
        </p>
      )}
      <FooterActionsLayout
        order={order}
        canConfirm={canConfirm}
        cancelAction={cancelAction}
        otherActions={otherActions}
        isPending={transition.isPending}
        stage={stage}
        editable={editable}
        onChangeStage={changeStage}
      />
    </div>
  );
}

type FooterActionsLayoutProps = {
  order: OrderDetail;
  canConfirm: boolean;
  cancelAction?: 'cancelled';
  otherActions: readonly StageAction[];
  isPending: boolean;
  stage: RefObject<HTMLSpanElement | null>;
  editable: boolean;
  onChangeStage: (change: OrderStageChange, button: HTMLButtonElement) => void;
};

function FooterActionsLayout(props: FooterActionsLayoutProps) {
  const {
    order,
    canConfirm,
    cancelAction,
    otherActions,
    isPending,
    stage,
    editable,
    onChangeStage,
  } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {canConfirm && (
        <Button
          className="order-3 min-h-11 sm:min-h-10"
          disabled={isPending}
          aria-label="Mark confirmed"
          onClick={(event) => onChangeStage({ to: 'to_pack' }, event.currentTarget)}
        >
          Confirm
        </Button>
      )}
      <div className="order-1">
        {cancelAction && (
          <OrderStageDialog
            order={order}
            action={cancelAction}
            stage={stage}
            primary={false}
            disabled={isPending}
          />
        )}
      </div>
      <div className="order-2 flex flex-wrap items-center gap-2 sm:ml-auto">
        <StageActionButtons
          actions={otherActions}
          canConfirm={canConfirm}
          isPending={isPending}
          stage={stage}
          order={order}
          onChangeStage={onChangeStage}
        />
        {editable && <EditOrderDialog order={order} disabled={isPending} />}
      </div>
    </div>
  );
}

type StageActionButtonsProps = {
  actions: readonly StageAction[];
  canConfirm: boolean;
  isPending: boolean;
  stage: RefObject<HTMLSpanElement | null>;
  order: OrderDetail;
  onChangeStage: (change: OrderStageChange, button: HTMLButtonElement) => void;
};

function StageActionButtons({
  actions,
  canConfirm,
  isPending,
  stage,
  order,
  onChangeStage,
}: StageActionButtonsProps) {
  return (
    <>
      {actions.map((action, index) =>
        action === 'to_confirm' || action === 'delivered' ? (
          <Button
            key={action}
            variant={!canConfirm && index === 0 ? 'primary' : 'secondary'}
            disabled={isPending}
            className="min-h-11 sm:min-h-10"
            onClick={(event) => onChangeStage({ to: action }, event.currentTarget)}
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
            disabled={isPending}
          />
        ),
      )}
    </>
  );
}
