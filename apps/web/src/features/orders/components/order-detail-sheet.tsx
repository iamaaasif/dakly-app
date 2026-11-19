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
  onDirectAction: (action: 'to_confirm' | 'delivered', button: HTMLElement) => void;
  onDialogAction: (action: StageFormAction) => void;
};

function SecondaryActionsMenu({
  actions,
  disabled,
  onDirectAction,
  onDialogAction,
}: SecondaryActionsMenuProps) {
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
          <DropdownMenuItem
            key={action}
            onSelect={(e) =>
              action === 'to_confirm' || action === 'delivered'
                ? onDirectAction(action, e.target as HTMLElement)
                : onDialogAction(action)
            }
          >
            {stageActionLabels[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type PrimaryStageButtonProps = {
  order: OrderDetail;
  action: StageAction;
  stage: RefObject<HTMLSpanElement | null>;
  disabled: boolean;
  onDirectAction: (action: 'to_confirm' | 'delivered', el: HTMLElement) => void;
};

function PrimaryStageButton({
  order,
  action,
  stage,
  disabled,
  onDirectAction,
}: PrimaryStageButtonProps) {
  if (action === 'to_confirm' || action === 'delivered') {
    return (
      <Button
        variant="primary"
        disabled={disabled}
        className="min-h-11 sm:min-h-10"
        onClick={(e) => onDirectAction(action, e.currentTarget)}
      >
        {stageActionLabels[action]}
      </Button>
    );
  }
  return (
    <OrderStageDialog order={order} action={action} stage={stage} primary disabled={disabled} />
  );
}

function useChangeStage(
  transition: ReturnType<typeof useOrderStage>,
  orderId: string,
  stageRef: RefObject<HTMLSpanElement | null>,
) {
  return (change: OrderStageChange, button: HTMLElement) => {
    const drawer = button.closest('[role="dialog"]');
    transition.mutate(
      { id: orderId, body: change },
      {
        onSuccess: () => {
          const focused = document.activeElement;
          if (focused === button || focused === drawer || focused === document.body)
            stageRef.current?.focus();
        },
      },
    );
  };
}

type FooterConfirmButtonProps = {
  show: boolean;
  disabled: boolean;
  onConfirm: (button: HTMLElement) => void;
};

function FooterConfirmButton({ show, disabled, onConfirm }: FooterConfirmButtonProps) {
  if (!show) return null;
  return (
    <Button
      className="min-h-11 sm:min-h-10"
      disabled={disabled}
      onClick={(e) => onConfirm(e.currentTarget)}
    >
      Confirm
    </Button>
  );
}

type ActiveStageDialogProps = {
  order: OrderDetail;
  action: StageFormAction | null;
  stage: RefObject<HTMLSpanElement | null>;
  disabled: boolean;
  onClose: () => void;
};

function ActiveStageDialog({ order, action, stage, disabled, onClose }: ActiveStageDialogProps) {
  if (!action) return null;
  return (
    <OrderStageDialog
      order={order}
      action={action}
      stage={stage}
      primary
      disabled={disabled}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      trigger={null}
    />
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
  const primaryAction = canConfirm ? null : otherActions[0];
  const secondaryActions = canConfirm ? otherActions : otherActions.slice(1);
  const changeStage = useChangeStage(transition, order.id, stage);

  return (
    <div className="flex w-full flex-col gap-2">
      {transition.error && (
        <p role="alert" className="w-full text-danger">
          {transition.error.message}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {cancelAction && (
          <OrderStageDialog
            order={order}
            action={cancelAction}
            stage={stage}
            primary={false}
            disabled={transition.isPending}
          />
        )}
        <div className="flex items-center gap-2">
          <SecondaryActionsMenu
            actions={secondaryActions}
            disabled={transition.isPending}
            onDirectAction={(action, el) => changeStage({ to: action }, el)}
            onDialogAction={setActiveDialog}
          />
          {editable && <EditOrderDialog order={order} disabled={transition.isPending} />}
          <FooterConfirmButton
            show={canConfirm}
            disabled={transition.isPending}
            onConfirm={(el) => changeStage({ to: 'to_pack' }, el)}
          />
          {primaryAction && (
            <PrimaryStageButton
              order={order}
              action={primaryAction}
              stage={stage}
              disabled={transition.isPending}
              onDirectAction={(action, el) => changeStage({ to: action }, el)}
            />
          )}
        </div>
      </div>
      <ActiveStageDialog
        order={order}
        action={activeDialog}
        stage={stage}
        disabled={transition.isPending}
        onClose={() => setActiveDialog(null)}
      />
    </div>
  );
}
