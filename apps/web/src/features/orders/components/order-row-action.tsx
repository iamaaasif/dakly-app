import type { OrderListItem } from '@dakly/contracts/orders';

import { useOrderStage } from '../api/change-order-stage';
import {
  canBookCourier,
  canConfirmOrder,
  canMarkOrderDelivered,
  isFinishedOrder,
} from '../order-actions';
import { UrlLink } from '@/components/url-link';

const actionStyle =
  'inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-inverse px-3.5 text-sm font-medium text-on-primary hover:bg-inverse/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:h-9 md:min-h-9';

type OrderRowActionProps = { order: OrderListItem; href: string; canEdit: boolean };

export function OrderRowAction({ order, href, canEdit }: OrderRowActionProps) {
  const stage = useOrderStage();
  if (canMarkOrderDelivered(order, canEdit)) {
    return (
      <div className="col-start-2 md:col-start-auto">
        <button
          type="button"
          data-order-row-action={order.id}
          disabled={stage.isPending}
          aria-label={`Mark order #${order.number} delivered`}
          onClick={() => stage.mutate({ id: order.id, body: { to: 'delivered' } })}
          className={`${actionStyle} disabled:opacity-60`}
        >
          {stage.isPending ? 'Saving' : 'Mark delivered'}
        </button>
        {stage.error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {stage.error.message}
          </p>
        ) : null}
      </div>
    );
  }
  if (isFinishedOrder(order.stage)) return null;
  const { text, accessibleName } = linkLabels(order, canEdit);
  return (
    <UrlLink
      href={href}
      data-order-row-action={order.id}
      aria-label={accessibleName}
      className={`col-start-2 md:col-start-auto ${actionStyle}`}
    >
      {text}
    </UrlLink>
  );
}

function linkLabels(order: OrderListItem, canEdit: boolean) {
  const number = `order #${order.number}`;
  if (canBookCourier(order, canEdit))
    return { text: 'Book courier', accessibleName: `Book courier for ${number}` };
  if (canConfirmOrder(order, canEdit))
    return { text: 'Confirm', accessibleName: `Confirm ${number}` };
  return { text: 'Details', accessibleName: `Details for ${number}` };
}
