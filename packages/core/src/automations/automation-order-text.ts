import { renderOrderFields } from '@dakly/contracts/automations/text';
import { formatMoney } from '@dakly/contracts/money';

type OrderText = { orderNumber: number; totalPoisha: number };

export function renderOrderText(text: string, order: OrderText, confirmLink: string): string {
  return renderOrderFields(text, {
    order_number: String(order.orderNumber),
    order_total: formatMoney(order.totalPoisha),
    confirm_link: confirmLink,
  });
}
