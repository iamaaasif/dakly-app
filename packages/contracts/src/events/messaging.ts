import { z } from 'zod';

import { trackedLinkSourceTypes } from '../campaigns';
import { chatChannels } from '../channels';
import { handoverReasons } from '../chats';

const messagePayloadSchema = z.strictObject({
  messageId: z.uuid(),
  conversationId: z.uuid(),
  contactId: z.uuid(),
  channel: z.enum(chatChannels),
});

export const conversationStartedEventSchema = z.strictObject({
  type: z.literal('conversation.started'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    conversationId: z.uuid(),
    contactId: z.uuid(),
    connectionId: z.uuid(),
    channel: z.enum(chatChannels),
  }),
});

export const messageReceivedEventSchema = z.strictObject({
  type: z.literal('message.received'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema,
});

// The payload string is what the shop attached to the button; the consumer decides what it means.
export const messagePostbackReceivedEventSchema = z.strictObject({
  type: z.literal('message.postback_received'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema.omit({ messageId: true }).extend({
    postback: z.string().min(1).max(1000),
  }),
});

export const conversationHandedOverEventSchema = z.strictObject({
  type: z.literal('conversation.handed_over'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ conversationId: z.uuid(), reason: z.enum(handoverReasons) }),
});

export const messageSendRequestedEventSchema = z.strictObject({
  type: z.literal('message.send_requested'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema.pick({ messageId: true }),
});

export const messageSentEventSchema = z.strictObject({
  type: z.literal('message.sent'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema,
});

export const messageDeliveredEventSchema = z.strictObject({
  type: z.literal('message.delivered'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema,
});

export const messageReadEventSchema = z.strictObject({
  type: z.literal('message.read'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema,
});

export const messageFailedEventSchema = z.strictObject({
  type: z.literal('message.failed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema,
});

const trackedLinkPayloadSchema = z.strictObject({
  trackedLinkId: z.uuid(),
  contactId: z.uuid().nullable(),
  sourceType: z.enum(trackedLinkSourceTypes),
  sourceId: z.uuid().nullable(),
});

// Only the first tap on a link; later taps are visits on the same link.
export const messageTappedEventSchema = z.strictObject({
  type: z.literal('message.tapped'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: trackedLinkPayloadSchema,
});

export const messageOptedOutEventSchema = z.strictObject({
  type: z.literal('message.opted_out'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: trackedLinkPayloadSchema.extend({ contactId: z.uuid() }),
});
