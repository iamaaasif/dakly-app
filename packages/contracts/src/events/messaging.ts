import { z } from 'zod';

import { chatChannels } from '../channels';

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
