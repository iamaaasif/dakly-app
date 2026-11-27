import { type DaklyEvent } from '../events/dakly-event';

// What a store must have before a trigger can fire, an action can run or a template can be used.
export const automationPrerequisites = [
  'birthdays',
  'segment_membership',
  'channels',
  'chats_extension',
  'products',
  'orders',
  'store_sync',
  'tracking_script',
] as const;
export type AutomationPrerequisite = (typeof automationPrerequisites)[number];

// Build order (D40): 'channels' is ready before channel connections and Orders, 'orders' before
// Orders only, null once Orders or a later source exists.
type AvailableBefore = 'channels' | 'orders' | null;

export const triggerFilterFields = [
  'channel',
  'intent',
  'keywords',
  'consent_source',
  'tag',
  'segment',
  'lifecycle_stage',
  'order_total',
  'cart_total',
  'product',
  'payment_status',
  'delivery_district',
  'first_order',
  'days',
] as const;
export type TriggerFilterField = (typeof triggerFilterFields)[number];

// A plannedEvent is not in packages/contracts/src/events yet; the task that emits it adds it.
type TriggerSource =
  { event: DaklyEvent['type'] } | { plannedEvent: string } | { schedule: 'daily' };

type TriggerEntry = {
  source: TriggerSource;
  filters: Partial<Record<TriggerFilterField, 'required' | 'optional'>>;
  needs: AutomationPrerequisite | null;
  availableBefore: AvailableBefore;
};

export const triggerKeys = [
  'consent_given',
  'tag_added',
  'segment_joined',
  'link_tapped',
  'birthday',
  'chat_started',
  'message_received',
  'comment_on_post',
  'lead_captured',
  'back_in_stock',
  'price_dropped',
  'order_placed',
  'order_paid',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'order_returned',
  'order_link_abandoned',
  'lifecycle_stage_entered',
  'days_since_last_order',
  'reorder_due',
  'cart_abandoned',
  'checkout_abandoned',
  'product_viewed',
] as const;
export type TriggerKey = (typeof triggerKeys)[number];

export const automationTriggers: Record<TriggerKey, TriggerEntry> = {
  consent_given: {
    source: { event: 'consent.changed' },
    filters: { channel: 'optional', consent_source: 'optional' },
    needs: null,
    availableBefore: 'channels',
  },
  tag_added: {
    source: { event: 'contact.tag_added' },
    filters: { tag: 'required' },
    needs: null,
    availableBefore: 'channels',
  },
  // Feature 03: needs stored segment membership, which segments do not keep yet.
  segment_joined: {
    source: { plannedEvent: 'segment.entered' },
    filters: { segment: 'required' },
    needs: 'segment_membership',
    availableBefore: null,
  },
  link_tapped: {
    source: { event: 'message.tapped' },
    filters: { channel: 'optional' },
    needs: null,
    availableBefore: null,
  },
  birthday: {
    source: { schedule: 'daily' },
    filters: { segment: 'optional' },
    needs: 'birthdays',
    availableBefore: 'channels',
  },
  chat_started: {
    source: { event: 'conversation.started' },
    filters: { channel: 'optional' },
    needs: 'channels',
    availableBefore: 'orders',
  },
  // Fires once per burst of customer messages, after the chat classifier reads it.
  message_received: {
    source: { event: 'message.intent_classified' },
    filters: { channel: 'optional', intent: 'optional', keywords: 'optional' },
    needs: 'channels',
    availableBefore: 'orders',
  },
  comment_on_post: {
    source: { plannedEvent: 'comment.received' },
    filters: {},
    needs: 'channels',
    availableBefore: 'orders',
  },
  lead_captured: {
    source: { plannedEvent: 'chat.lead_saved' },
    filters: { channel: 'optional' },
    needs: 'channels',
    availableBefore: 'orders',
  },
  back_in_stock: {
    source: { plannedEvent: 'variant.restocked' },
    filters: { product: 'optional' },
    needs: 'products',
    availableBefore: 'orders',
  },
  price_dropped: {
    source: { plannedEvent: 'product.price_dropped' },
    filters: { product: 'optional' },
    needs: 'products',
    availableBefore: 'orders',
  },
  order_placed: {
    source: { event: 'order.created' },
    filters: {
      order_total: 'optional',
      product: 'optional',
      payment_status: 'optional',
      delivery_district: 'optional',
      first_order: 'optional',
    },
    needs: 'orders',
    availableBefore: null,
  },
  order_paid: {
    source: { plannedEvent: 'payment.succeeded' },
    filters: { order_total: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  // D21: staff move the order to With courier; there is no courier status feed.
  order_shipped: {
    source: { event: 'order.stage_changed' },
    filters: { order_total: 'optional', delivery_district: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  order_delivered: {
    source: { event: 'order.stage_changed' },
    filters: { order_total: 'optional', product: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  order_cancelled: {
    source: { event: 'order.stage_changed' },
    filters: { order_total: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  order_returned: {
    source: { event: 'order.stage_changed' },
    filters: { order_total: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  order_link_abandoned: {
    source: { plannedEvent: 'order_link.abandoned' },
    filters: { product: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  // Stages come from orders (glossary), so every contact is 'none' until Orders exists.
  lifecycle_stage_entered: {
    source: { plannedEvent: 'contact.stage_changed' },
    filters: { lifecycle_stage: 'required' },
    needs: 'orders',
    availableBefore: null,
  },
  days_since_last_order: {
    source: { schedule: 'daily' },
    filters: { days: 'required' },
    needs: 'orders',
    availableBefore: null,
  },
  // days counts back from the contact's usual gap between orders.
  reorder_due: {
    source: { schedule: 'daily' },
    filters: { days: 'required', product: 'optional' },
    needs: 'orders',
    availableBefore: null,
  },
  cart_abandoned: {
    source: { plannedEvent: 'cart.abandoned' },
    filters: { cart_total: 'optional' },
    needs: 'store_sync',
    availableBefore: null,
  },
  checkout_abandoned: {
    source: { plannedEvent: 'checkout.abandoned' },
    filters: { cart_total: 'optional' },
    needs: 'store_sync',
    availableBefore: null,
  },
  product_viewed: {
    source: { plannedEvent: 'product.viewed' },
    filters: { product: 'optional' },
    needs: 'tracking_script',
    availableBefore: null,
  },
};

// The order triggers that a worker subscriber starts workflows from.
export const orderTriggerKeys: readonly TriggerKey[] = [
  'order_placed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'order_returned',
];

// Started by a subscriber on a chat event instead of an order event.
const chatTriggerKeys: readonly TriggerKey[] = ['message_received'];

export function isTriggerAvailable(key: TriggerKey): boolean {
  const trigger = automationTriggers[key];
  const readyBeforeChannels =
    trigger.availableBefore === 'channels' && !('plannedEvent' in trigger.source);
  return readyBeforeChannels || orderTriggerKeys.includes(key) || chatTriggerKeys.includes(key);
}

// SMS and Messenger send (CAMP-7); WhatsApp comes with Q2.
const sendableChannels: readonly string[] = ['sms', 'messenger'];

export function isChannelSendable(channel: string): boolean {
  return sendableChannels.includes(channel);
}

export const actionKinds = [
  'add_tag',
  'remove_tag',
  'create_task',
  'notify_team',
  'hand_to_person',
  'give_coupon',
] as const;
export type ActionKind = (typeof actionKinds)[number];

export const automationActions: Record<
  ActionKind,
  { needs: AutomationPrerequisite | null; availableBefore: AvailableBefore }
> = {
  add_tag: { needs: null, availableBefore: 'channels' },
  remove_tag: { needs: null, availableBefore: 'channels' },
  create_task: { needs: null, availableBefore: 'channels' },
  notify_team: { needs: null, availableBefore: 'channels' },
  hand_to_person: { needs: 'chats_extension', availableBefore: 'orders' },
  // Discount codes live in Orders.
  give_coupon: { needs: 'orders', availableBefore: null },
};
