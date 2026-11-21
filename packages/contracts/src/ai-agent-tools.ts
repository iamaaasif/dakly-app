import type { ZodType } from 'zod';
import { z } from 'zod';

import { handoverReasons } from './chats';
import { bdMobileSchema } from './phone';

export type AiToolDefinition = {
  name: string;
  description: string;
  aliases: readonly string[];
  input: ZodType;
  units: Record<string, string>;
};

// The model picks a tool for the customer's own words, so the description and
// aliases name those words in Bangla, Banglish and English.
export const searchProductsTool = {
  name: 'search_products',
  description:
    'Find up to 3 products by name or what the customer calls them, with each variant price and stock. Use it first when the customer asks for a product, a price or stock. Use get_product when you already have the product id.',
  aliases: ['দাম', 'দাম কত', 'আছে কি', 'price', 'price koto', 'stock ache', 'available', 'ache?'],
  input: z.strictObject({ query: z.string().trim().min(3).max(100) }),
  units: {
    priceTaka: 'taka, converted from poisha',
    stock: 'count of pieces left; null when the shop does not count stock',
  },
} satisfies AiToolDefinition;

export const getProductTool = {
  name: 'get_product',
  description:
    'Read one product: description, category, variants with price and stock. Use it for questions about size, colour, material or one variant after search_products gave you the product id.',
  aliases: ['সাইজ', 'রঙ', 'কালার', 'size', 'color', 'colour', 'details', 'detail den'],
  input: z.strictObject({ productId: z.uuid() }),
  units: {
    priceTaka: 'taka, converted from poisha',
    stock: 'count of pieces left; null when the shop does not count stock',
  },
} satisfies AiToolDefinition;

export const getDeliveryChargeTool = {
  name: 'get_delivery_charge',
  description:
    'Delivery charge to an area, thana, district or city. Use it for any delivery cost question. Give the place name the customer wrote; up to 3 matching places come back with their charge. When no place matches, the shop’s delivery zones come back instead: use the zone of the locality’s city, and ask the customer when you cannot tell. Your reply names the place the charge is for, such as “Delivery to Dhaka city is ৳60”, so the customer can correct a wrong guess.',
  aliases: [
    'ডেলিভারি চার্জ',
    'ডেলিভারি খরচ',
    'delivery charge',
    'delivery koto',
    'courier charge',
    'mirpur e delivery',
  ],
  input: z.strictObject({ area: z.string().trim().min(2).max(60) }),
  units: { chargeTaka: 'taka, converted from poisha' },
} satisfies AiToolDefinition;

export const searchKnowledgeTool = {
  name: 'search_knowledge',
  description:
    'Search the shop’s own policies and FAQs: return, exchange, payment methods, delivery time, opening hours. Use it for any shop rule question. If nothing useful comes back, hand over; never guess a policy.',
  aliases: [
    'রিটার্ন পলিসি',
    'পেমেন্ট',
    'return policy',
    'payment kivabe',
    'bkash number',
    'koto din lagbe',
  ],
  input: z.strictObject({ question: z.string().trim().min(3).max(300) }),
  units: {},
} satisfies AiToolDefinition;

export const getMyOrdersTool = {
  name: 'get_my_orders',
  description:
    'List this customer’s own latest 5 orders with number, stage and total. Takes no arguments: it can only show the customer you are chatting with. Use it for “my orders” and when the customer gives no order number.',
  aliases: ['আমার অর্ডার', 'আমার অর্ডারগুলো', 'my orders', 'amar order', 'order list'],
  input: z.strictObject({}),
  units: { totalTaka: 'taka, converted from poisha' },
} satisfies AiToolDefinition;

export const getOrderStatusTool = {
  name: 'get_order_status',
  description:
    'Status of one of this customer’s own orders by order number: stage, items, total, courier and tracking code. Use it for “where is my order”. An order of another customer is reported as not found.',
  aliases: [
    'অর্ডার কোথায়',
    'অর্ডারের অবস্থা',
    'order status',
    'order kothay',
    'parcel kothay',
    'tracking',
  ],
  input: z.strictObject({ orderNumber: z.int().positive().max(2147483647) }),
  units: { totalTaka: 'taka, converted from poisha' },
} satisfies AiToolDefinition;

export const sendProductCardTool = {
  name: 'send_product_card',
  description:
    'Send the customer a product card with name and price before your reply. Always pass variantId, photoId and withoutPhoto, with null for the ones that do not apply. Use it when the customer wants to see a product or asks for options. Pass variantId when the customer asks about one colour or size, so the card shows the photo of that variant. When the product has no such variant but its photos are tagged with the colour or style the customer asked for, pass the photoId of that photo instead. When the customer asks for a colour or style that no photo matches, set withoutPhoto so no other colour is shown as if it were the one asked for, and say that colour is not available. The price on the card comes from the shop, so do not repeat it in your own words unless a tool returned it.',
  aliases: ['ছবি', 'দেখান', 'photo', 'picture', 'pic den', 'dekhan'],
  input: z.strictObject({
    productId: z.uuid(),
    variantId: z.uuid().nullable(),
    photoId: z.uuid().nullable(),
    withoutPhoto: z.boolean().nullable(),
  }),
  units: {},
} satisfies AiToolDefinition;

export const draftOrderTool = {
  name: 'draft_order',
  description:
    'Create an order for this customer, delivered to the customer themselves, when you have the product variants, quantities, name, the customer’s own mobile number, the full address and the area (thana, upazila or district). Ask for every missing detail in one message first. The order waits for the customer’s yes. The result has the order number, items, delivery charge and total: write the summary from it and ask the customer to reply yes (হ্যাঁ). Never repeat the customer’s phone number in the summary. When the customer orders for another person, hand over instead.',
  aliases: ['অর্ডার করব', 'নিব', 'কিনব', 'order korbo', 'nibo', 'order dibo', 'i want to order'],
  input: z.strictObject({
    items: z
      .array(z.strictObject({ variantId: z.uuid(), quantity: z.int().positive().max(20) }))
      .min(1)
      .max(10),
    recipientName: z.string().trim().min(1).max(120),
    phone: bdMobileSchema,
    address: z.string().trim().min(1).max(500),
    area: z.string().trim().min(2).max(60),
  }),
  units: {
    quantity: 'count of pieces, 1 to 20 per variant',
    unitPriceTaka: 'taka, converted from poisha',
    deliveryChargeTaka: 'taka, converted from poisha',
    totalTaka: 'taka including delivery, converted from poisha',
  },
} satisfies AiToolDefinition;

export const confirmOrderTool = {
  name: 'confirm_order',
  description:
    'Confirm one of this customer’s own orders that is waiting for confirmation, after the customer said yes to the summary (হ্যাঁ, yes, ji, ok, ঠিক আছে). Use the order number from draft_order or get_my_orders. When the result says ORDER_ADVANCE_REQUIRED, hand over with the reason other: a person asks this customer for the delivery charge in advance.',
  aliases: ['হ্যাঁ', 'ji', 'yes', 'ok', 'ঠিক আছে', 'thik ache', 'confirm'],
  input: z.strictObject({ orderNumber: z.int().positive().max(2147483647) }),
  units: {},
} satisfies AiToolDefinition;

export const handOverReasons = handoverReasons.filter(
  (reason) => reason !== 'ai_unavailable' && reason !== 'allowance_used',
);

export const handOverTool = {
  name: 'hand_over',
  description:
    'Pass the chat to a person. Use it for refunds, exchanges, complaints, discounts, an angry customer, a request for a person, a question you cannot answer from tool results, or a customer ready to buy when no order tool is available. Allowed reasons: asked_for_person, complaint, refund, discount, angry, out_of_scope, ready_to_buy, other.',
  aliases: [
    'মানুষের সাথে কথা বলব',
    'ফেরত',
    'agent chai',
    'manush er sathe kotha',
    'refund',
    'complain',
  ],
  input: z.strictObject({ reason: z.enum(handOverReasons) }),
  units: {},
} satisfies AiToolDefinition;

export const salesAgentTools = [
  searchProductsTool,
  getProductTool,
  getDeliveryChargeTool,
  searchKnowledgeTool,
  getMyOrdersTool,
  getOrderStatusTool,
  sendProductCardTool,
  draftOrderTool,
  confirmOrderTool,
  handOverTool,
] as const;
