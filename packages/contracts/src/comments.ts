import { z } from 'zod';

import { commentClassifications, commentStatuses } from './chats';
import { searchText } from './search-text';

// What a comment asks for, read from its words; one comment can hold several.
export const commentIntents = ['price', 'order', 'question'] as const;
export type CommentIntent = (typeof commentIntents)[number];

// Meta accepts one private reply per comment, and only within 7 days of the comment.
export const privateReplyWindowDays = 7;

export const commentChannels = ['messenger', 'instagram'] as const;

const commentCursorSchema = z
  .templateLiteral([z.iso.datetime(), '_', z.uuid()])
  .refine((cursor) => !cursor.startsWith('0000-'), 'Invalid cursor timestamp');

export const commentListQuerySchema = z.strictObject({
  cursor: commentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(commentStatuses).optional(),
  classification: z.enum(commentClassifications).optional(),
  externalPostId: z.string().min(1).max(200).optional(),
});

export const commentReplySchema = z.strictObject({ body: searchText.max(2000) });

export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
export type CommentReplyInput = z.infer<typeof commentReplySchema>;

export type CommentResponse = {
  id: string;
  channel: (typeof commentChannels)[number];
  externalPostId: string;
  postCaption: string | null;
  authorName: string | null;
  body: string | null;
  classification: (typeof commentClassifications)[number] | null;
  status: (typeof commentStatuses)[number];
  isReply: boolean;
  publicReplied: boolean;
  privateRepliedAt: string | null;
  canReplyPrivately: boolean;
  commentedAt: string;
};
