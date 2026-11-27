import { z } from 'zod';

import { trackedLinkSourceTypes } from '../campaigns';
import { chatChannels } from '../channels';
import { chatIntents, handoverReasons } from '../chats';

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

// One per burst of customer messages, whether or not the AI agent reads the chat. Events carry no
// message text, so a consumer that needs the words reads the burst's messages by id, newest first.
export const messageBurstReceivedEventSchema = z.strictObject({
  type: z.literal('message.burst_received'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema.omit({ messageId: true }).extend({
    // Null when the classifier did not read the burst: AI replies off, a chat with a person, or
    // a message the AI stopped on before classifying.
    intent: z.enum(chatIntents).nullable(),
    messageIds: z.array(z.uuid()).min(1).max(50),
  }),
});

// The payload string is what the shop attached to the button; the consumer decides what it means.
export const messagePostbackReceivedEventSchema = z.strictObject({
  type: z.literal('message.postback_received'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema.omit({ messageId: true }).extend({
    postback: z.string().min(1).max(1000),
    identityId: z.uuid().optional(),
    tapKey: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  }),
});

// Saved with the message in the same transaction, so the media copy is never lost.
export const messageAttachmentsRequestedEventSchema = z.strictObject({
  type: z.literal('message.attachments_requested'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: messagePayloadSchema.pick({ messageId: true }),
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
