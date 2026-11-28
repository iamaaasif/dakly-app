import { MoreHorizontal, Printer } from 'lucide-react';
import { useContext, useRef, useState, type RefObject } from 'react';

import type { OrderDetail, OrderStage, OrderStageChange } from '@dakly/contracts/orders';
import { Button, buttonVariants } from '@dakly/ui/button';
import { Dialog } from '@dakly/ui/dialog';
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
  leavesDelivered,
  reopensOrder,
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
        order && (
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

type OrderTransitionErrorProps = {
  error?: { message: string } | null;
};

function OrderTransitionError({ error }: OrderTransitionErrorProps) {
  if (!error) return null;
  return (
    <p role="alert" className="w-full text-danger">
      {error.message}
    </p>
  );
}

type ConfirmOrderButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

function ConfirmOrderButton({ disabled, onClick }: ConfirmOrderButtonProps) {
  return (
    <Button className="min-h-11 sm:min-h-10" disabled={disabled} onClick={onClick}>
      Confirm
    </Button>
  );
}

function PrintInvoiceLink({ orderId }: { orderId: string }) {
  return (
    <a
      href={`/orders/${orderId}/print#print`}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'secondary' })}
    >
      <Printer size={16} aria-hidden="true" />
      Print invoice
    </a>
  );
}

const leftStageNames: Partial<Record<OrderStage, string>> = {
  cancelled: 'Cancelled',
  returned: 'Returned',
};

const keepLabels: Partial<Record<OrderStage, string>> = {
  cancelled: 'Keep cancelled',
  returned: 'Keep returned',
};

function leaveStageWarning(stage: OrderStage, label: string): string {
  if (stage === 'cancelled')
    return `${label} reserves the stock for this order again. It fails if there is not enough stock left.`;
  if (stage === 'returned')
    return `${label} takes the returned units off the shelf again and sets the payment back to what it was before the return. It fails if the units are gone.`;
  return `${label} takes back the COD collected for this order and puts the stock count back to where it was before delivery.`;
}

type LeaveDeliveredDialogProps = {
  order: OrderDetail;
  action: StageAction;
  onCancel: () => void;
  onConfirm: () => void;
};

function LeaveDeliveredDialog({ order, action, onCancel, onConfirm }: LeaveDeliveredDialogProps) {
  return (
    <Dialog
      title={`Move order #${order.number} out of ${leftStageNames[order.stage] ?? 'Delivered'}?`}
      open
      onClose={onCancel}
    >
      <p className="mb-4">{leaveStageWarning(order.stage, stageActionLabels[action])}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {keepLabels[order.stage] ?? 'Keep delivered'}
        </Button>
        <Button onClick={onConfirm}>{stageActionLabels[action]}</Button>
      </div>
    </Dialog>
  );
}

type StageDialogsProps = {
  order: OrderDetail;
  stage: RefObject<HTMLSpanElement | null>;
  exitAction: StageAction | null;
  activeDialog: StageFormAction | null;
  onCancelExit: () => void;
  onConfirmExit: () => void;
  onCloseDialog: (open: boolean) => void;
};

function StageDialogs(props: StageDialogsProps) {
  const { order, stage, exitAction, activeDialog } = props;
  return (
    <>
      {exitAction && (
        <LeaveDeliveredDialog
          order={order}
          action={exitAction}
          onCancel={props.onCancelExit}
          onConfirm={props.onConfirmExit}
        />
      )}
      {activeDialog && (
        <OrderStageDialog
          key={activeDialog}
          order={order}
          action={activeDialog}
          stage={stage}
          open
          onOpenChange={props.onCloseDialog}
        />
      )}
    </>
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

function useStageActionState(order: OrderDetail, mutate: (change: OrderStageChange) => void) {
  const [activeDialog, setActiveDialog] = useState<StageFormAction | null>(null);
  const [exitAction, setExitAction] = useState<StageAction | null>(null);
  const runAction = (a: StageAction) =>
    a === 'to_confirm' || a === 'to_pack' || a === 'delivered'
      ? mutate({ to: a })
      : setActiveDialog(a);
  // Leaving Delivered, Returned or Cancelled undoes the COD collection and the stock count, so staff confirm it first.
  const handleAction = (a: StageAction) =>
    (leavesDelivered(order.stage) || reopensOrder(order.stage)) && a !== 'cod' && a !== 'returned'
      ? setExitAction(a)
      : runAction(a);
  const confirmExit = () => {
    if (exitAction) runAction(exitAction);
    setExitAction(null);
  };
  return { activeDialog, setActiveDialog, exitAction, setExitAction, handleAction, confirmExit };
}

function OrderStageFooter(props: OrderStageFooterProps) {
  const { order, transition, stage, canConfirm, actions, editable } = props;
  const cancel = actions.find((a): a is 'cancelled' => a === 'cancelled');
  const other = actions.filter((a) => a !== 'cancelled');
  const secondary = canConfirm ? other : other.slice(1);
  const mutate = changeStage(transition, order.id, stage);
  const { activeDialog, setActiveDialog, exitAction, setExitAction, handleAction, confirmExit } =
    useStageActionState(order, mutate);

  const closeDialog = (open: boolean) => {
    if (open) return;
    setActiveDialog(null);
    requestAnimationFrame(() => stage.current?.focus());
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <OrderTransitionError error={transition.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PrintInvoiceLink orderId={order.id} />
          {cancel && (
            <CancelOrderButton
              disabled={transition.isPending}
              onClick={() => setActiveDialog(cancel)}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SecondaryActionsMenu
            actions={secondary}
            disabled={transition.isPending}
            onSelectAction={handleAction}
          />
          {editable && <EditOrderDialog order={order} disabled={transition.isPending} />}
          {canConfirm && (
            <ConfirmOrderButton
              disabled={transition.isPending}
              onClick={() => mutate({ to: 'to_pack' })}
            />
          )}
          <PrimaryStageButton
            action={canConfirm ? null : other[0]}
            disabled={transition.isPending}
            onAction={handleAction}
          />
        </div>
      </div>
      <StageDialogs
        order={order}
        stage={stage}
        exitAction={exitAction}
        activeDialog={activeDialog}
        onCancelExit={() => setExitAction(null)}
        onConfirmExit={confirmExit}
        onCloseDialog={closeDialog}
      />
    </div>
  );
}
