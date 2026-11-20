import { z } from 'zod';

import { chatChannels } from './channels';
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

export const conversationListQuerySchema = conversationMessageListQuerySchema.extend({
  cursor: z.union([messageCursorSchema, z.templateLiteral(['none_', z.uuid()])]).optional(),
  status: z.enum(conversationStatuses).optional(),
  responder: z.enum(conversationResponders).optional(),
  channel: z.enum(chatChannels).optional(),
  assigneeUserId: z.uuid().optional(),
});

export const updateConversationSchema = z
  .strictObject({
    status: z.enum(conversationStatuses).optional(),
    assigneeUserId: z.uuid().toLowerCase().nullable().optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one field');

export const createConversationNoteSchema = z.strictObject({ body: searchText.max(4000) });
export const takeOverConversationSchema = z
  .strictObject({ returnAfterMinutes: z.literal([30, 60, 360]).optional() })
  .default({});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationMessageListQuery = z.infer<typeof conversationMessageListQuerySchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateConversationNoteInput = z.infer<typeof createConversationNoteSchema>;
export type TakeOverConversationInput = z.infer<typeof takeOverConversationSchema>;

export type ConversationResponse = {
  id: string;
  contactId: string;
  contactName: string | null;
  channel: (typeof chatChannels)[number];
  status: (typeof conversationStatuses)[number];
  responder: (typeof conversationResponders)[number];
  assigneeUserId: string | null;
  handoverReason: (typeof handoverReasons)[number] | null;
  handedOverAt: string | null;
  aiResumesAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  windowExpiresAt: string | null;
  unreadCount: number;
};

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

export type ConversationCountsResponse = {
  all: number;
  needsYou: number;
  aiHandling: number;
  followUp: number;
};
