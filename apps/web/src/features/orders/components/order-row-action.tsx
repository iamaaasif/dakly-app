import type { OrderListItem } from '@dakly/contracts/orders';

import { useOrderStage } from '../api/change-order-stage';
import {
  canBookCourier,
  canConfirmOrder,
  canMarkOrderDelivered,
  isFinishedOrder,
} from '../order-actions';
import { rowActionClass } from './order-row-styles';
import { UrlLink } from '@/components/url-link';

type OrderRowActionProps = { order: OrderListItem; href: string; canEdit: boolean };

export function OrderRowAction({ order, href, canEdit }: OrderRowActionProps) {
  const stage = useOrderStage();
  if (canMarkOrderDelivered(order, canEdit)) {
    return (
      <div>
        <button
          type="button"
          data-order-row-action={order.id}
          disabled={stage.isPending}
          aria-label={`Mark order #${order.number} delivered`}
          onClick={() => stage.mutate({ id: order.id, body: { to: 'delivered' } })}
          className={`${rowActionClass} disabled:opacity-60`}
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
      className={rowActionClass}
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
