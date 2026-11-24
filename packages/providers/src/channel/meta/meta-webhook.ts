import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type {
  ChannelReceipt,
  InboundAttachmentKind,
  InboundComment,
  InboundMessage,
  InboundPostback,
  InboundReferral,
} from '../channel-driver';

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
// Meta puts the referral on the event, or on the message for a first message sent from an ad.
const referral = z
  .object({
    ad_id: z.string().min(1).max(64).optional(),
    ads_context_data: z
      .object({
        ad_title: z.string().min(1).max(200).optional(),
        post_id: z.string().min(1).max(64).optional(),
      })
      .optional(),
  })
  .transform((value): InboundReferral | null =>
    value.ad_id || value.ads_context_data?.post_id
      ? {
          adId: value.ad_id ?? null,
          postId: value.ads_context_data?.post_id ?? null,
          title: value.ads_context_data?.ad_title ?? null,
        }
      : null,
  );
const messagingEvent = z.object({
  ...participants,
  timestamp,
  referral: z.unknown().optional(),
  message: z.object({
    referral: z.unknown().optional(),
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
const attachmentKinds = {
  image: 'image',
  audio: 'voice',
  video: 'video',
  file: 'file',
} as const satisfies Record<string, InboundAttachmentKind>;
// Shares, reels and story mentions carry a link to someone else's post, not customer media.
const attachment = z.object({
  type: z.enum(['image', 'audio', 'video', 'file']),
  payload: z.object({ url: z.url({ protocol: /^https$/ }) }),
});
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

const unixSeconds = z.number().int().nonnegative().max(8.64e12);
const facebookComment = z.object({
  item: z.literal('comment'),
  verb: z.literal('add'),
  comment_id: z.string().min(1),
  post_id: z.string().min(1),
  parent_id: z.string().min(1).optional(),
  from: z.object({ id: z.string().min(1), name: z.string().min(1).optional() }),
  message: z.string().min(1),
  created_time: unixSeconds,
});
const instagramComment = z.object({
  id: z.string().min(1),
  parent_id: z.string().min(1).optional(),
  from: z.object({ id: z.string().min(1), username: z.string().min(1).optional() }),
  media: z.object({ id: z.string().min(1) }),
  text: z.string().min(1),
});
const commentEntry = z.object({
  id: z.string().min(1),
  time: unixSeconds.optional(),
  changes: z.array(z.object({ field: z.string(), value: z.unknown() })).default([]),
});

type MetaMessagingChannel = 'messenger' | 'instagram';
type MetaReceipt = z.infer<typeof receiptEvent>;
type ReceiptAddress = Pick<ChannelReceipt, 'channel' | 'accountExternalId' | 'recipientExternalId'>;

function inboundReferral(...candidates: unknown[]): InboundReferral | null {
  return candidates.map((candidate) => referral.safeParse(candidate).data).find(Boolean) ?? null;
}

function inboundMessage(channel: MetaMessagingChannel, account: string, event: unknown) {
  const parsed = messagingEvent.safeParse(event).data;
  if (!parsed || parsed.recipient.id !== account || parsed.sender.id === account) return undefined;
  const { sender, timestamp, message } = parsed;
  if (message.is_echo || message.is_self || message.is_deleted) return undefined;
  const attachments = message.attachments.flatMap((item) => {
    const parsedItem = attachment.safeParse(item).data;
    return parsedItem
      ? [{ kind: attachmentKinds[parsedItem.type], url: parsedItem.payload.url }]
      : [];
  });
  if (!message.text && attachments.length === 0) return undefined;
  return {
    channel,
    accountExternalId: account,
    externalConversationId: sender.id,
    externalMessageId: message.mid,
    senderExternalId: sender.id,
    text: message.text || null,
    attachments,
    referral: inboundReferral(message.referral, parsed.referral),
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

function facebookCommentOf(account: string, value: unknown): InboundComment | undefined {
  const parsed = facebookComment.safeParse(value).data;
  if (!parsed || parsed.from.id === account) return undefined;
  return {
    channel: 'messenger',
    accountExternalId: account,
    externalPostId: parsed.post_id,
    externalCommentId: parsed.comment_id,
    // Meta sets parent_id to the post for a top-level comment.
    parentExternalCommentId:
      parsed.parent_id && parsed.parent_id !== parsed.post_id ? parsed.parent_id : null,
    authorExternalId: parsed.from.id,
    authorName: parsed.from.name ?? null,
    text: parsed.message,
    commentedAt: new Date(parsed.created_time * 1000),
  };
}

function instagramCommentOf(
  account: string,
  value: unknown,
  time: number | undefined,
): InboundComment | undefined {
  const parsed = instagramComment.safeParse(value).data;
  // The Instagram event carries no comment time, so the delivery time stands in for it.
  if (!parsed || parsed.from.id === account || time === undefined) return undefined;
  return {
    channel: 'instagram',
    accountExternalId: account,
    externalPostId: parsed.media.id,
    externalCommentId: parsed.id,
    parentExternalCommentId: parsed.parent_id ?? null,
    authorExternalId: parsed.from.id,
    authorName: parsed.from.username ?? null,
    text: parsed.text,
    commentedAt: new Date(time * 1000),
  };
}

export function parseMetaComments(payload: unknown): InboundComment[] {
  const delivery = deliverySchema.safeParse(payload).data;
  if (!delivery || (delivery.object !== 'page' && delivery.object !== 'instagram')) return [];
  const facebook = delivery.object === 'page';
  return delivery.entry.flatMap((rawEntry) => {
    const entry = commentEntry.safeParse(rawEntry).data;
    if (!entry) return [];
    return entry.changes.flatMap(({ field, value }) => {
      if (facebook && field !== 'feed') return [];
      if (!facebook && field !== 'comments') return [];
      const comment = facebook
        ? facebookCommentOf(entry.id, value)
        : instagramCommentOf(entry.id, value, entry.time);
      return comment ? [comment] : [];
    });
  });
}
