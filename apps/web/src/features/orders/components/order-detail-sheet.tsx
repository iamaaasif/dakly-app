import { MoreHorizontal } from 'lucide-react';
import { useContext, useRef, useState, type RefObject } from 'react';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';
import { QueryError } from '@dakly/ui/query-error';
import { Sheet, type SheetProps } from '@dakly/ui/sheet';

import { useOrderStage } from '../api/change-order-stage';
import { useOrder } from '../api/get-order';
import { canConfirmOrder, canEditOrder } from '../order-actions';
import { orderSourceLabels } from '../order-labels';
import { EditOrderDialog } from './edit-order-dialog';
import { OrderDetails } from './order-details';
import {
  orderStageActions,
  stageActionLabels,
  type StageAction,
  type StageFormAction,
} from './order-stage-actions';
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

type SecondaryActionsMenuProps = {
  actions: readonly StageAction[];
  disabled: boolean;
  onSelectAction: (action: StageAction) => void;
};

function SecondaryActionsMenu({ actions, disabled, onSelectAction }: SecondaryActionsMenuProps) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="min-h-11 sm:min-h-10" disabled={disabled}>
          <MoreHorizontal size={16} aria-hidden="true" />
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action} onSelect={() => onSelectAction(action)}>
            {stageActionLabels[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function refocusStageBadge(badge: RefObject<HTMLSpanElement | null>) {
  const focused = document.activeElement;
  if (!focused || focused === document.body || !focused.isConnected) {
    badge.current?.focus();
  }
}

function changeStage(
  transition: ReturnType<typeof useOrderStage>,
  orderId: string,
  stage: RefObject<HTMLSpanElement | null>,
) {
  return (change: OrderStageChange) => {
    transition.mutate({ id: orderId, body: change }, { onSuccess: () => refocusStageBadge(stage) });
  };
}

type CancelOrderButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

function CancelOrderButton({ disabled, onClick }: CancelOrderButtonProps) {
  return (
    <Button
      variant="secondary"
      disabled={disabled}
      className="min-h-11 border-transparent bg-transparent px-1.5 text-xs text-danger shadow-none hover:border-transparent hover:bg-danger-soft hover:text-danger sm:min-h-10 sm:px-2 sm:text-sm"
      onClick={onClick}
    >
      Cancel order
    </Button>
  );
}

type PrimaryStageButtonProps = {
  action?: StageAction | null;
  disabled: boolean;
  onAction: (action: StageAction) => void;
};

function PrimaryStageButton({ action, disabled, onAction }: PrimaryStageButtonProps) {
  if (!action) return null;
  return (
    <Button
      variant="primary"
      disabled={disabled}
      className="min-h-11 sm:min-h-10"
      onClick={() => onAction(action)}
    >
      {stageActionLabels[action]}
    </Button>
  );
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
  const [activeDialog, setActiveDialog] = useState<StageFormAction | null>(null);

  const cancelAction = actions.find((a): a is 'cancelled' => a === 'cancelled');
  const otherActions = actions.filter((a) => a !== 'cancelled');
  const secondaryActions = canConfirm ? otherActions : otherActions.slice(1);
  const mutate = changeStage(transition, order.id, stage);

  const handleAction = (a: StageAction) =>
    a === 'to_confirm' || a === 'delivered' ? mutate({ to: a }) : setActiveDialog(a);

  return (
    <div className="flex w-full flex-col gap-2">
      {transition.error && (
        <p role="alert" className="w-full text-danger">
          {transition.error.message}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {cancelAction && (
          <CancelOrderButton
            disabled={transition.isPending}
            onClick={() => setActiveDialog(cancelAction)}
          />
        )}
        <div className="flex items-center gap-2">
          <SecondaryActionsMenu
            actions={secondaryActions}
            disabled={transition.isPending}
            onSelectAction={handleAction}
          />
          {editable && <EditOrderDialog order={order} disabled={transition.isPending} />}
          {canConfirm && (
            <Button
              className="min-h-11 sm:min-h-10"
              disabled={transition.isPending}
              onClick={() => mutate({ to: 'to_pack' })}
            >
              Confirm
            </Button>
          )}
          <PrimaryStageButton
            action={canConfirm ? null : otherActions[0]}
            disabled={transition.isPending}
            onAction={handleAction}
          />
        </div>
      </div>
      {activeDialog && (
        <OrderStageDialog
          key={activeDialog}
          order={order}
          action={activeDialog}
          stage={stage}
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
        />
      )}
    </div>
  );
}
