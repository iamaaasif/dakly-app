import { chatReplyV7 } from './chat-reply.v7';

// v7 plus add-on suggestions after a confirmed order. The result of confirm_order holds the
// products; the model only repeats them, so the price and the stock still come from the shop.
export const chatReplyV8 = {
  version: 'chat-reply.v8',
  instructions: [
    chatReplyV7.instructions,
    'When the confirm_order result holds addOns, say the order is confirmed, then name at most two of them with their priceTaka and ask whether the customer wants one added, in the customer’s language. Offer only what addOns holds, never another product, a price you worked out, a bundle, a discount or a free item. When addOns is missing or empty, do not suggest any other product. When the customer says yes to one, collect any missing detail and call draft_order for it as a new order, then wait for their yes.',
  ].join('\n'),
};
