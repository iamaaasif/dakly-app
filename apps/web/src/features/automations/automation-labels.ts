import type { AutomationStatus } from '@dakly/contracts/automations';
import type { TriggerKey } from '@dakly/contracts/automations/catalogue';
import type { CampaignChannel } from '@dakly/contracts/campaigns';

export const channelLabels: Record<CampaignChannel, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
};

export const triggerLabels: Record<TriggerKey, string> = {
  consent_given: 'customers subscribe to marketing',
  tag_added: 'customers receive a tag',
  segment_joined: 'customers join a segment',
  link_tapped: 'customers tap a link',
  birthday: 'it is a customer’s birthday',
  chat_started: 'customers start a chat',
  comment_on_post: 'customers comment on a post',
  lead_captured: 'customers become leads',
  back_in_stock: 'a product comes back in stock',
  price_dropped: 'a product’s price drops',
  order_placed: 'customers place an order',
  order_paid: 'customers pay for an order',
  order_shipped: 'customers have their order shipped',
  order_delivered: 'customers receive an order',
  order_cancelled: 'customers cancel an order',
  order_returned: 'customers return an order',
  order_link_abandoned: 'customers leave an order link unfinished',
  lifecycle_stage_entered: 'customers reach a new stage',
  days_since_last_order: 'customers have not ordered for a set time',
  reorder_due: 'customers are due to reorder',
  cart_abandoned: 'customers leave items in their cart',
  checkout_abandoned: 'customers start checkout without finishing',
  product_viewed: 'customers view a product',
};

export const statusLabels: Record<AutomationStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  paused: 'Disabled',
  archived: 'Archived',
};
