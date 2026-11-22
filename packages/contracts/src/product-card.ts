import { z } from 'zod';

import { formatMoney } from './money';

// Meta's limits for a Generic Template element: 80 characters for the title and subtitle, 20 for a
// button title, 3 buttons, 10 elements in a carousel.
const TITLE_LENGTH = 80;
const BUTTON_TITLE_LENGTH = 20;
export const productCardMaxButtons = 3;
export const productCardMaxElements = 10;

export const productCardButtonSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('postback'),
    title: z.string().min(1).max(BUTTON_TITLE_LENGTH),
    payload: z.string().min(1).max(1000),
  }),
  z.strictObject({
    type: z.literal('link'),
    title: z.string().min(1).max(BUTTON_TITLE_LENGTH),
    url: z.url(),
  }),
]);

export const productCardElementSchema = z.strictObject({
  title: z.string().min(1).max(TITLE_LENGTH),
  subtitle: z.string().min(1).max(TITLE_LENGTH),
  imageObjectKey: z.string().min(1).optional(),
  buttons: z.array(productCardButtonSchema).min(1).max(productCardMaxButtons),
});

export const productCarouselSchema = z.strictObject({
  elements: z.array(productCardElementSchema).min(1).max(productCardMaxElements),
});

export type ProductCardButton = z.infer<typeof productCardButtonSchema>;
export type ProductCardElement = z.infer<typeof productCardElementSchema>;
export type ProductCarousel = z.infer<typeof productCarouselSchema>;

export type ProductCardInput = {
  productId: string;
  name: string;
  variants: { id: string; title: string; pricePoisha: number; inStock: boolean }[];
  // The one size the customer asked about, when there is one.
  onlyVariantId?: string;
  imageObjectKey?: string;
};

// Payloads the webhook reads back when a customer taps a button.
export const productCardPayload = {
  order: (productId: string, variantId?: string) =>
    variantId ? `card:order:${productId}:${variantId}` : `card:order:${productId}`,
  sizes: (productId: string) => `card:sizes:${productId}`,
  human: 'card:human',
} as const;

const OUT_OF_STOCK = 'স্টক নেই (out of stock)';

function truncate(text: string, length: number) {
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

// The price line shows only what can be bought, so a sold-out size's price is never offered.
function priceLine({ variants, onlyVariantId }: ProductCardInput) {
  const shown = onlyVariantId ? variants.filter(({ id }) => id === onlyVariantId) : variants;
  const buyable = shown.filter(({ inStock }) => inStock);
  const [first] = buyable;
  if (!first) return OUT_OF_STOCK;
  const prices = buyable.map(({ pricePoisha }) => pricePoisha);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const price =
    lowest === highest ? formatMoney(lowest) : `${formatMoney(lowest)} – ${formatMoney(highest)}`;
  return onlyVariantId && shown.length === 1 ? `${first.title}: ${price}` : price;
}

export function buildProductCardElement(input: ProductCardInput): ProductCardElement {
  const { productId, name, variants, onlyVariantId, imageObjectKey } = input;
  const shown = onlyVariantId ? variants.filter(({ id }) => id === onlyVariantId) : variants;
  const canOrder = shown.some(({ inStock }) => inStock);
  const orderVariant = onlyVariantId && canOrder ? onlyVariantId : undefined;
  const buttons: ProductCardButton[] = [];
  if (canOrder)
    buttons.push({
      type: 'postback',
      title: 'Order now',
      payload: productCardPayload.order(productId, orderVariant),
    });
  if (!onlyVariantId && variants.length > 1)
    buttons.push({
      type: 'postback',
      title: 'See sizes',
      payload: productCardPayload.sizes(productId),
    });
  buttons.push({ type: 'postback', title: 'Talk to a person', payload: productCardPayload.human });
  return {
    title: truncate(name, TITLE_LENGTH),
    subtitle: truncate(priceLine(input), TITLE_LENGTH),
    ...(imageObjectKey ? { imageObjectKey } : {}),
    buttons,
  };
}

export type CardTap =
  | { kind: 'order'; productId: string; variantId?: string }
  | { kind: 'sizes'; productId: string }
  | { kind: 'human' };

// Reads back what productCardPayload wrote; any other payload (a campaign button, say) is not ours.
export function parseCardTap(payload: string): CardTap | undefined {
  const [prefix, action, productId, variantId] = payload.split(':');
  if (prefix !== 'card') return undefined;
  if (action === 'human') return { kind: 'human' };
  if (!productId || !z.uuid().safeParse(productId).success) return undefined;
  if (action === 'sizes') return { kind: 'sizes', productId };
  if (action !== 'order') return undefined;
  if (variantId === undefined) return { kind: 'order', productId };
  return z.uuid().safeParse(variantId).success
    ? { kind: 'order', productId, variantId }
    : undefined;
}
