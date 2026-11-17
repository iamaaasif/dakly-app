import { describe, expect, it } from 'vitest';

import { type DaklyEvent, daklyEventSchema } from './dakly-event';

const storeId = '019c01ea-cf15-7d31-a7f5-d73d66007ad7';
const contactId = '019c01ea-cf15-7d31-a7f5-d73d66007ad8';
const conversationId = '019c01ea-cf15-7d31-a7f5-d73d66007ad9';
const messageId = '019c01ea-cf15-7d31-a7f5-d73d66007ada';
const connectionId = '019c01ea-cf15-7d31-a7f5-d73d66007adb';
const occurredAt = '2026-11-16T04:30:00.000Z';
const message = { messageId, conversationId, contactId, channel: 'messenger' } as const;
const trackedLink = {
  trackedLinkId: '019c01ea-cf15-7d31-a7f5-d73d66007adf',
  contactId,
  sourceType: 'campaign',
  sourceId: '019c01ea-cf15-7d31-a7f5-d73d66007ae0',
} as const;

const examples: DaklyEvent[] = [
  { type: 'contact.created', storeId, occurredAt, payload: { contactId } },
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
