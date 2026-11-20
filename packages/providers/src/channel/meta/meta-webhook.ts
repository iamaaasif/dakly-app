import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { ChannelReceipt, InboundMessage, InboundPostback } from '../channel-driver';

const deliverySchema = z.looseObject({
  object: z.string().min(1),
  entry: z.array(z.looseObject({ id: z.string().min(1) })),
});

const messagingEvents = z.array(z.unknown());
const participants = {
  sender: z.object({ id: z.string().min(1) }),
  recipient: z.object({ id: z.string().min(1) }),
};
const timestamp = z.number().int().nonnegative().max(8.64e15);
const messagingEvent = z.object({
  ...participants,
  timestamp,
  message: z.object({
    mid: z.string().min(1),
    text: z.string().optional(),
    attachments: z.array(z.unknown()).default([]),
    is_echo: z.boolean().optional(),
    is_self: z.boolean().optional(),
    is_deleted: z.boolean().optional(),
  }),
});
const postbackEvent = z.object({
  ...participants,
  timestamp,
  postback: z.object({ payload: z.string().min(1).max(1000) }),
});
const attachment = z.object({ payload: z.object({ url: z.url({ protocol: /^https$/ }) }) });
const receiptEvent = z.object({
  ...participants,
  timestamp: timestamp.optional(),
  delivery: z
    .object({
      mids: z.array(z.string().min(1)).optional(),
      watermark: timestamp.optional(),
    })
    .optional(),
  read: z.object({ mid: z.string().min(1).optional(), watermark: timestamp.optional() }).optional(),
  message: z.unknown().optional(),
});
const echoMessage = z.object({
  mid: z.string().min(1),
  metadata: z.uuid(),
  is_echo: z.literal(true),
  app_id: z.union([z.string().min(1), z.int().positive()]).transform(String),
});

type MetaMessagingChannel = 'messenger' | 'instagram';
type MetaReceipt = z.infer<typeof receiptEvent>;
type ReceiptAddress = Pick<ChannelReceipt, 'channel' | 'accountExternalId' | 'recipientExternalId'>;

function inboundMessage(channel: MetaMessagingChannel, account: string, event: unknown) {
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

function inboundPostback(channel: MetaMessagingChannel, account: string, event: unknown) {
  const parsed = postbackEvent.safeParse(event).data;
  if (!parsed || parsed.recipient.id !== account || parsed.sender.id === account) return undefined;
  return {
    channel,
    accountExternalId: account,
    senderExternalId: parsed.sender.id,
    payload: parsed.postback.payload,
    occurredAt: new Date(parsed.timestamp),
  } satisfies InboundPostback;
}

function receipt(
  channel: MetaMessagingChannel,
  account: string,
  event: unknown,
): ChannelReceipt | undefined {
  const parsed = receiptEvent.safeParse(event).data;
  if (!parsed || parsed.sender.id === parsed.recipient.id) return;
  const { sender, recipient } = parsed;
  if (channel === 'messenger' && sender.id === account)
    return outboundEcho(
      { channel, accountExternalId: account, recipientExternalId: recipient.id },
      parsed,
    );
  if (recipient.id === account)
    return customerReceipt(
      { channel, accountExternalId: account, recipientExternalId: sender.id },
      parsed,
    );
}

function outboundEcho(address: ReceiptAddress, event: MetaReceipt): ChannelReceipt | undefined {
  const echo = echoMessage.safeParse(event.message).data;
  if (!echo || event.timestamp === undefined) return;
  return {
    ...address,
    kind: 'echo',
    occurredAt: new Date(event.timestamp),
    externalMessageId: echo.mid,
    operationKey: echo.metadata,
    appExternalId: echo.app_id,
  };
}

function customerReceipt(address: ReceiptAddress, event: MetaReceipt): ChannelReceipt | undefined {
  const target = receiptTarget(address.channel, event);
  if (!target) return;
  const { kind, watermark, ids } = target;
  const time = event.timestamp ?? watermark;
  if (time === undefined) return;
  const common = { ...address, kind, occurredAt: new Date(time) };
  if (ids?.length) return { ...common, externalMessageIds: ids };
  if (watermark !== undefined) return { ...common, through: new Date(watermark) };
}

function receiptTarget(channel: MetaMessagingChannel, { delivery, read }: MetaReceipt) {
  if (channel === 'messenger' && delivery)
    return { kind: 'delivered' as const, watermark: delivery.watermark, ids: delivery.mids };
  if (read)
    return {
      kind: 'read' as const,
      watermark: channel === 'messenger' ? read.watermark : undefined,
      ids: read.mid ? [read.mid] : undefined,
    };
}

function parseDelivery<T>(
  payload: unknown,
  parseEvent: (channel: MetaMessagingChannel, account: string, event: unknown) => T | undefined,
): T[] {
  const delivery = deliverySchema.safeParse(payload).data;
  if (!delivery || (delivery.object !== 'page' && delivery.object !== 'instagram')) return [];
  const channel = delivery.object === 'page' ? 'messenger' : 'instagram';
  return delivery.entry.flatMap((entry) => {
    const events = messagingEvents.safeParse(entry.messaging).data ?? [];
    return events.flatMap((event) => {
      const parsed = parseEvent(channel, entry.id, event);
      return parsed ? [parsed] : [];
    });
  });
}

export function parseMetaWebhook(payload: unknown): InboundMessage[] {
  return parseDelivery(payload, inboundMessage);
}

export function parseMetaPostbacks(payload: unknown): InboundPostback[] {
  return parseDelivery(payload, inboundPostback);
}

export function parseMetaReceipts(payload: unknown): ChannelReceipt[] {
  return parseDelivery(payload, receipt);
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
