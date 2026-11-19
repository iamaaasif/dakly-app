import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { InboundMessage } from '../channel-driver';

const deliverySchema = z.looseObject({
  object: z.string().min(1),
  entry: z.array(z.looseObject({ id: z.string().min(1) })),
});

const messagingEvents = z.array(z.unknown());
const messagingEvent = z.object({
  sender: z.object({ id: z.string().min(1) }),
  recipient: z.object({ id: z.string().min(1) }),
  timestamp: z.number().int().nonnegative().max(8.64e15),
  message: z.object({
    mid: z.string().min(1),
    text: z.string().optional(),
    attachments: z.array(z.unknown()).default([]),
    is_echo: z.boolean().optional(),
    is_self: z.boolean().optional(),
    is_deleted: z.boolean().optional(),
  }),
});
const attachment = z.object({ payload: z.object({ url: z.url({ protocol: /^https$/ }) }) });

function inboundMessage(channel: 'messenger' | 'instagram', account: string, event: unknown) {
  const parsed = messagingEvent.safeParse(event).data;
  if (!parsed || parsed.recipient.id !== account || parsed.sender.id === account) return undefined;
  const { sender, timestamp, message } = parsed;
  if (message.is_echo || message.is_self || message.is_deleted) return undefined;
  const attachmentUrls = message.attachments.flatMap((item) => {
    const url = attachment.safeParse(item).data?.payload.url;
    return url ? [url] : [];
  });
  if (!message.text && attachmentUrls.length === 0) return undefined;
  return {
    channel,
    accountExternalId: account,
    externalConversationId: sender.id,
    externalMessageId: message.mid,
    senderExternalId: sender.id,
    text: message.text ?? null,
    attachmentUrls,
    sentAt: new Date(timestamp),
  } satisfies InboundMessage;
}

export function parseMetaWebhook(payload: unknown): InboundMessage[] {
  const delivery = deliverySchema.safeParse(payload).data;
  if (!delivery || (delivery.object !== 'page' && delivery.object !== 'instagram')) return [];
  const channel = delivery.object === 'page' ? 'messenger' : 'instagram';
  return delivery.entry.flatMap((entry) => {
    const events = messagingEvents.safeParse(entry.messaging).data ?? [];
    return events.flatMap((event) => {
      const message = inboundMessage(channel, entry.id, event);
      return message ? [message] : [];
    });
  });
}

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signature: string,
  appSecret: string,
): boolean {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function readMetaWebhookDelivery(rawBody: Buffer): Record<string, unknown> | undefined {
  try {
    const payload: unknown = JSON.parse(rawBody.toString('utf8'));
    return deliverySchema.safeParse(payload).data;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
