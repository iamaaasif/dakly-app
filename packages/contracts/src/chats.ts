import { z } from 'zod';

import { chatChannels } from './channels';
import type { ContactKind } from './contacts';
import { searchText } from './search-text';

export const conversationStatuses = ['open', 'needs_you', 'later', 'done'] as const;
export const conversationResponders = ['ai', 'human', 'paused'] as const;
export const handoverReasons = [
  'asked_for_person',
  'complaint',
  'refund',
  'discount',
  'angry',
  'out_of_scope',
  'ready_to_buy',
  'ai_unavailable',
  'allowance_used',
  'ai_paused',
  'store_read_only',
  'other',
] as const;
// What the customer's latest messages are about, as the classifier reads them.
export const chatIntents = [
  'greeting',
  'price',
  'size_or_stock',
  'delivery',
  'payment',
  'order',
  'confirm',
  'order_status',
  'exchange',
  'complaint',
  'photo',
  'special_request',
  'other',
] as const;
export const leadTemperatures = ['hot', 'warm', 'cold'] as const;
export const messageDirections = ['in', 'out'] as const;
export const messageAuthorTypes = ['customer', 'ai', 'user', 'system'] as const;
export const messageKinds = [
  'text',
  'image',
  'voice',
  'video',
  'file',
  'product_card',
  'order_card',
  'payment_link',
  'template',
  'note',
  'system',
] as const;
export const messageAttachmentKinds = ['image', 'voice', 'video', 'file'] as const;
export const messageAttachmentFailures = [
  'expired',
  'too_large',
  'type_not_allowed',
  'unavailable',
  'rejected',
  'connection_unavailable',
] as const;
// What an inbound attachment may be, by kind. Meta states the type; nothing here sniffs bytes.
export const inboundAttachmentLimits = {
  image: {
    maxBytes: 8 * 1024 * 1024,
    contentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  },
  voice: {
    maxBytes: 16 * 1024 * 1024,
    contentTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm'],
  },
  video: {
    maxBytes: 25 * 1024 * 1024,
    contentTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
  },
  file: {
    maxBytes: 25 * 1024 * 1024,
    contentTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ],
  },
} as const satisfies Record<
  (typeof messageAttachmentKinds)[number],
  { maxBytes: number; contentTypes: readonly string[] }
>;
const attachmentKindSchema = z.enum(messageAttachmentKinds);
// pending keeps Meta's link until the copy finishes; the other two states drop it.
export const messageAttachmentSchema = z.discriminatedUnion('status', [
  z.strictObject({ kind: attachmentKindSchema, status: z.literal('pending'), sourceUrl: z.url() }),
  z.strictObject({
    kind: attachmentKindSchema,
    status: z.literal('stored'),
    objectKey: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    // Set once the voice note was transcribed or the photo described, or the try was given up.
    read: z.enum(['done', 'failed']).optional(),
  }),
  z.strictObject({
    kind: attachmentKindSchema,
    status: z.literal('failed'),
    reason: z.enum(messageAttachmentFailures),
  }),
]);
export const messageAttachmentsSchema = z.array(messageAttachmentSchema);
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

// Only photos and voice notes are read; video and files wait for a later task.
export function isAwaitingReading(attachment: MessageAttachment): boolean {
  if (attachment.kind !== 'image' && attachment.kind !== 'voice') return false;
  return attachment.status === 'pending' || (attachment.status === 'stored' && !attachment.read);
}

// What the model reports about a customer's photo. searchWords are written for a product search,
// in English and Bangla, so one photo finds the shop's item whichever language its name uses.
export const photoReadingSchema = z.strictObject({
  subject: z.enum(['product', 'payment_screenshot', 'other']),
  description: z.string().max(400),
  searchWords: z.array(z.string().min(1).max(40)).max(12),
  visibleText: z.string().max(400),
});
export type PhotoReading = z.infer<typeof photoReadingSchema>;

// A read photo is saved as text that starts with this label; the AI agent finds photos by it.
export const photoReadingLabel = 'Photo';
const photoReadingStart = /^(?:photo|ছবি)\s*:\s*/iu;
const photoReadingFieldLabels = /^(?:search words|text in photo)\s*:\s*/gimu;

// The words of a read photo with its labels removed, or undefined when the text is not a photo.
export function photoSearchText(text: string): string | undefined {
  const start = photoReadingStart.exec(text.trimStart());
  if (!start) return undefined;
  return text.trimStart().slice(start[0].length).replace(photoReadingFieldLabels, '').trim();
}

export const messageStatuses = [
  'received',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
export const messageSourceTypes = ['chat', 'campaign', 'automation', 'transactional'] as const;
export const messageSendCategories = ['staff_reply', 'transactional', 'marketing'] as const;
export const aiRatings = ['good', 'bad'] as const;
export const commentClassifications = ['question', 'positive', 'negative', 'spam'] as const;
export const commentStatuses = ['new', 'replied', 'needs_you', 'hidden', 'ignored'] as const;
// SMS sent outside a chat, campaign or workflow: order confirmation, order link receipt,
// payment receipt, a one-off message from a customer profile.
export const smsMessagePurposes = [
  'order_confirmation',
  'order_update',
  'payment_receipt',
  'manual',
] as const;
export const smsMessageStatuses = ['queued', 'sent', 'delivered', 'failed'] as const;

const messageCursorSchema = z
  .templateLiteral([z.iso.datetime(), '_', z.uuid()])
  .refine((cursor) => !cursor.startsWith('0000-'), 'Invalid cursor timestamp');

export const conversationMessageListQuerySchema = z.strictObject({
  cursor: messageCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const conversationSorts = ['recent', 'needs_you', 'unread', 'waiting'] as const;
// The Inbox folders. Snoozed and Resolved are states, not folders: see conversationStates.
export const conversationFolders = [
  'all',
  'mine',
  'unassigned',
  'unreplied',
  'ai_handling',
  'order_request',
  'not_customers',
  'spam',
] as const;
// Open covers needs_you, Snoozed is later and Resolved is done.
export const conversationStates = ['open', 'snoozed', 'resolved'] as const;
const conversationCursorSchema = z.union([
  messageCursorSchema,
  z.templateLiteral(['none_', z.uuid()]),
  // The sorts that put some chats first lead with that group: 0 first, 1 after.
  z.templateLiteral([z.literal([0, 1]), '_', messageCursorSchema]),
  z.templateLiteral([z.literal([0, 1]), '_none_', z.uuid()]),
]);

// A label is a contact tag, so it has the same limit.
const labelText = z.string().trim().min(1).max(50);

export const conversationListQuerySchema = conversationMessageListQuerySchema.extend({
  cursor: conversationCursorSchema.optional(),
  sort: z.enum(conversationSorts).default('recent'),
  // A name, a full phone number, or the start of a number for members who see full phones.
  q: z.string().trim().min(1).max(120).optional(),
  folder: z.enum(conversationFolders).optional(),
  state: z.enum(conversationStates).optional(),
  channel: z.enum(chatChannels).optional(),
  assigneeUserId: z.uuid().optional(),
  label: labelText.optional(),
});

export const updateConversationSchema = z
  .strictObject({
    status: z.enum(conversationStatuses).optional(),
    assigneeUserId: z.uuid().toLowerCase().nullable().optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one field');

export const changeConversationLabelSchema = z.strictObject({
  label: labelText,
  change: z.enum(['add', 'remove']),
});
export const createConversationNoteSchema = z.strictObject({ body: searchText.max(4000) });
export const createConversationReplySchema = z.strictObject({
  body: searchText.max(2000),
  // One per send press, so a retried request does not send the reply twice.
  operationKey: z.uuid(),
});
// A person sends a product from the reply box as the same card the AI sends.
export const sendConversationProductSchema = z.strictObject({
  productId: z.uuid(),
  operationKey: z.uuid(),
});
export const takeOverConversationSchema = z
  .strictObject({ returnAfterMinutes: z.literal([30, 60, 360]).optional() })
  .default({});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationMessageListQuery = z.infer<typeof conversationMessageListQuerySchema>;
export type ChangeConversationLabelInput = z.infer<typeof changeConversationLabelSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateConversationNoteInput = z.infer<typeof createConversationNoteSchema>;
export type CreateConversationReplyInput = z.infer<typeof createConversationReplySchema>;
export type SendConversationProductInput = z.infer<typeof sendConversationProductSchema>;
export type TakeOverConversationInput = z.infer<typeof takeOverConversationSchema>;

// What the Chats header shows for the shop's day so far. The order figures are null for members who
// cannot view orders.
export type ConversationSummaryResponse = {
  aiRepliesToday: number;
  chatOrdersToday: { count: number; totalPoisha: number } | null;
};

export type ConversationResponse = {
  id: string;
  contactId: string;
  contactName: string | null;
  contactKind: ContactKind;
  labels: string[];
  channel: (typeof chatChannels)[number];
  status: (typeof conversationStatuses)[number];
  responder: (typeof conversationResponders)[number];
  assigneeUserId: string | null;
  handoverReason: (typeof handoverReasons)[number] | null;
  handoverSummary: string | null;
  handedOverAt: string | null;
  aiResumesAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  // Who wrote the newest sent message: Waiting for them and the preview's "You:" read it.
  lastMessageFrom: (typeof messageAuthorTypes)[number] | null;
  intentTag: ChatIntent | null;
  // The AI's draft for the team after a hand-over, until someone or the AI writes, or the customer
  // writes again.
  suggestedReply: string | null;
  windowExpiresAt: string | null;
  unreadCount: number;
};

export type ChatIntent = (typeof chatIntents)[number];

export type ConversationMessageResponse = {
  id: string;
  kind: (typeof messageKinds)[number];
  direction: (typeof messageDirections)[number];
  body: string | null;
  authorType: (typeof messageAuthorTypes)[number];
  authorUserId: string | null;
  status: (typeof messageStatuses)[number];
  sourceType: (typeof messageSourceTypes)[number];
  createdAt: string;
  sentAt: string | null;
};

// Folder counts are of open chats; the rest count All conversations. The dashboard reads needsYou.
export type ConversationCountsResponse = Record<(typeof conversationFolders)[number], number> & {
  unread: number;
  needsYou: number;
  snoozed: number;
  resolved: number;
};

export type ConversationAssigneeResponse = { userId: string; name: string };
