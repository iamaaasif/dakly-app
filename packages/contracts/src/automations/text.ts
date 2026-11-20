// Fields a workflow message can name. Only workflows started by an order have them; CAMP-14 adds
// the customer fields to the same renderer.
export const orderTextFields = ['order_number', 'order_total', 'confirm_link'] as const;
type OrderTextField = (typeof orderTextFields)[number];

const FIELD = /\{(\w+)\}/g;

function isOrderField(name: string): name is OrderTextField {
  return (orderTextFields as readonly string[]).includes(name);
}

export function usesOrderFields(text: string): boolean {
  return [...text.matchAll(FIELD)].some(([, name]) => isOrderField(name ?? ''));
}

// A confirm link only means something while the order waits in To confirm.
export function usesConfirmLink(text: string): boolean {
  return [...text.matchAll(FIELD)].some(([, name]) => name === 'confirm_link');
}

export function renderOrderFields(text: string, values: Record<OrderTextField, string>): string {
  return text.replace(FIELD, (field, name: string) => (isOrderField(name) ? values[name] : field));
}
