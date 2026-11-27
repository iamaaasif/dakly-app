import type { CommentResponse } from '@dakly/contracts/comments';
import { privateReplyWindowDays } from '@dakly/contracts/comments';

import { DAY_MS } from '../platform/time';
import type { CommentRow } from './comments.repository';

export function channelOf(kind: CommentRow['kind']) {
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
