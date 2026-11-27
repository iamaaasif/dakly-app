import type { AuditEntry } from '@dakly/contracts/audit';
import type { CommentResponse } from '@dakly/contracts/comments';
import { privateReplyWindowDays } from '@dakly/contracts/comments';

import { DAY_MS } from '../platform/time';
import type { CommentRow } from './comments.repository';

export function channelOf(kind: CommentRow['kind']): 'instagram' | 'messenger' {
  return kind === 'instagram' ? 'instagram' : 'messenger';
}

export function privateReplyClosesAt(row: CommentRow) {
  return new Date(new Date(row.commentedAt).getTime() + privateReplyWindowDays * DAY_MS);
}

export function canReplyPrivately(row: CommentRow, now: Date) {
  return !row.privateRepliedAt && now < privateReplyClosesAt(row);
}

export function toResponse(row: CommentRow, now: Date): CommentResponse {
  return {
    id: row.id,
    channel: channelOf(row.kind),
    externalPostId: row.externalPostId,
    postCaption: row.postCaption,
    authorName: row.authorName,
    body: row.body,
    classification: row.classification,
    status: row.status,
    isReply: row.parentExternalCommentId !== null,
    publicReplied: row.publicReplyExternalId !== null,
    privateRepliedAt: row.privateRepliedAt?.toISOString() ?? null,
    canReplyPrivately: canReplyPrivately(row, now),
    commentedAt: row.commentedAt,
  };
}

// Another reply already won, or the private window closed: the comment is settled, not failed.
export const automaticReplySkips = [
  'COMMENT_ALREADY_REPLIED',
  'COMMENT_PRIVATE_REPLY_USED',
  'COMMENT_PRIVATE_REPLY_EXPIRED',
  'COMMENT_PRIVATE_REPLY_BLOCKED',
  'CHANNEL_NOT_CONNECTED',
];

// Who sends decides which claims apply: the AI agent yields to an automation that claimed the
// comment, an automation answers its own claim, and staff always may.
export type ReplyBy = { actor: AuditEntry['actor']; scope: 'staff' | 'ai' | 'automation' };
export const staffBy = (userId: string): ReplyBy => ({
  actor: { kind: 'user', userId },
  scope: 'staff',
});
