import { describe, expect, it } from 'vitest';

import { type DaklyEvent, daklyEventSchema } from './dakly-event';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const contactId = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';
const conversationId = '019c01ea-cf15-7d31-a7f5-d73d66007ad9';
const messageId = '019c01ea-cf15-7d31-a7f5-d73d66007ada';
const connectionId = '019c01ea-cf15-7d31-a7f5-d73d66007adb';
const orderId = '019c01ea-cf15-7d31-a7f5-d73d66007ae3';
const occurredAt = '2026-11-16T04:30:00.000Z';
const message = { messageId, conversationId, contactId, channel: 'messenger' } as const;
const trackedLink = {
  trackedLinkId: '019c01ea-cf15-7d31-a7f5-d73d66007adf',
  contactId,
  sourceType: 'campaign',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007ae0',
} as const;

const examples: DaklyEvent[] = [
  { type: 'contact.tag_added', storeId, occurredAt, payload: { contactId, tag: 'ভিআইপি' } },
  {
    type: 'channel.needs_reconnect',
    storeId,
    occurredAt,
    payload: { channelConnectionId: connectionId },
  },
  {
    type: 'channel.connected',
    storeId,
    occurredAt,
    payload: { channelConnectionId: connectionId },
  },
  {
    type: 'channel.disconnected',
    storeId,
    occurredAt,
    payload: { channelConnectionId: connectionId },
  },
  {
    type: 'knowledge.index_requested',
    storeId,
    occurredAt,
    payload: { knowledgeItemId: 'be82bf85-585b-4c33-960c-5acda9043aa1' },
  },
  {
    type: 'order.stage_changed',
    storeId,
    occurredAt,
    payload: { orderId, from: 'to_confirm', to: 'to_pack' },
  },
  { type: 'order.confirmed', storeId, occurredAt, payload: { orderId } },
  { type: 'order.edited', storeId, occurredAt, payload: { orderId } },
  { type: 'order.created', storeId, occurredAt, payload: { orderId } },
  { type: 'order.cod_collected', storeId, occurredAt, payload: { orderId } },
  {
    type: 'stock.changed',
    storeId,
    occurredAt,
    payload: { variantId: '019c01ea-cf15-7d31-a7f5-d73d66007ae2', kind: 'adjust' },
  },
  {
    type: 'variant.restocked',
    storeId,
    occurredAt,
    payload: { variantId: '019c01ea-cf15-7d31-a7f5-d73d66007ae2' },
  },
  {
    type: 'product.updated',
    storeId,
    occurredAt,
    payload: { productId: '019c01ea-cf15-7d31-a7f5-d73d66007ae2' },
  },
  { type: 'contact.created', storeId, occurredAt, payload: { contactId } },
  { type: 'contact.deleted', storeId, occurredAt, payload: { contactId } },
  { type: 'contact_stats.repaired', storeId, occurredAt, payload: { day: '2026-11-19' } },
  { type: 'contact.birthday', storeId, occurredAt, payload: { contactId, day: '2026-11-16' } },
  {
    type: 'consent.changed',
    storeId,
    occurredAt,
    payload: {
      consentId: '019c01ea-cf15-7d31-a7f5-d73d66007adc',
      contactId,
      channel: 'whatsapp',
      status: 'withdrawn',
      source: 'stop_keyword',
    },
  },
  {
    type: 'segment.saved',
    storeId,
    occurredAt,
    payload: { segmentId: '019c01ea-cf15-7d31-a7f5-d73d66007adf' },
  },
  {
    type: 'import.started',
    storeId,
    occurredAt,
    payload: { importId: '019c01ea-cf15-7d31-a7f5-d73d66007ae1' },
  },
  {
    type: 'import.undo_requested',
    storeId,
    occurredAt,
    payload: { importId: '019c01ea-cf15-7d31-a7f5-d73d66007ae1' },
  },
  {
    type: 'campaign.approved',
    storeId,
    occurredAt,
    payload: { campaignId: '019c01ea-cf15-7d31-a7f5-d73d66007ae1', status: 'scheduled' },
  },
  {
    type: 'conversation.started',
    storeId,
    occurredAt,
    payload: { conversationId, contactId, connectionId, channel: 'instagram' },
  },
  { type: 'message.received', storeId, occurredAt, payload: message },
  { type: 'message.delivered', storeId, occurredAt, payload: message },
  { type: 'message.read', storeId, occurredAt, payload: message },
  { type: 'message.failed', storeId, occurredAt, payload: message },
  { type: 'message.tapped', storeId, occurredAt, payload: { ...trackedLink, contactId: null } },
  { type: 'message.opted_out', storeId, occurredAt, payload: trackedLink },
  {
    type: 'notification.created',
    storeId,
    occurredAt,
    payload: {
      notificationId: '019c01ea-cf15-7d31-a7f5-d73d66007add',
      userId: '019c01ea-cf15-7d31-a7f5-d73d66007ade',
      category: 'fix_now',
    },
  },
  {
    type: 'automation.paused',
    storeId,
    occurredAt,
    payload: {
      automationId: '019c01ea-cf15-7d31-a7f5-d73d66007adf',
      automationName: 'Welcome new customers',
      reason: 'balance',
    },
  },
  {
    type: 'wallet.credited',
    storeId,
    occurredAt,
    payload: { wallet: 'sms_credits', entryId: '019c01ea-cf15-7d31-a7f5-d73d66007ae0' },
  },
];

const personalData = {
  phone: '01712345678',
  email: 'nusrat@example.test',
  name: 'নুসরাত জাহান',
  text: 'দাম কত?',
};

describe('daklyEventSchema', () => {
  it('has one example for every event schema', () => {
    const exampleTypes = examples.map((event) => event.type).sort();
    const schemaTypes = daklyEventSchema.options.map((schema) => schema.shape.type.value).sort();
    expect(exampleTypes).toEqual(schemaTypes);
  });

  it.each(examples)('accepts a valid $type event', (event) => {
    expect(daklyEventSchema.parse(event)).toEqual(event);
  });

  it.each(
    examples.flatMap((event) =>
      Object.entries(personalData).map(([key, value]) => ({ event, key, value })),
    ),
  )('rejects a $event.type payload with a $key key', ({ event, key, value }) => {
    const withPersonalData = { ...event, payload: { ...event.payload, [key]: value } };
    expect(daklyEventSchema.safeParse(withPersonalData).success).toBe(false);
  });

  it('rejects an unknown event type', () => {
    const unknown = { type: 'contact.phoned', storeId, occurredAt, payload: { contactId } };
    expect(daklyEventSchema.safeParse(unknown).success).toBe(false);
  });
});
