import { renderOrderFields } from '@dakly/contracts/automations/text';

type OrderText = { orderNumber: number; totalPoisha: number };

// Bangladesh groups digits by lakh, so ৳1,25,000.
const takaFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatTaka(poisha: number): string {
  return `৳${takaFormat.format(poisha / 100)}`;
}

export function renderOrderText(text: string, order: OrderText, confirmLink: string): string {
  return renderOrderFields(text, {
    order_number: String(order.orderNumber),
    order_total: formatTaka(order.totalPoisha),
    confirm_link: confirmLink,
  });
}
