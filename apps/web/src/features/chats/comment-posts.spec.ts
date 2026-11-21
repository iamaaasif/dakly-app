import { describe, expect, it } from 'vitest';

import type { CommentResponse } from '@dakly/contracts/comments';

import { groupCommentsByPost } from './comment-posts';

function comment(overrides: Partial<CommentResponse>): CommentResponse {
  return {
    id: 'c',
    channel: 'messenger',
    externalPostId: 'post-1',
    postCaption: 'Women’s Kurti ৳850',
    authorName: 'Sadia Islam',
    body: 'Price koto?',
    classification: null,
    status: 'new',
    isReply: false,
    publicReplied: false,
    privateRepliedAt: null,
    canReplyPrivately: true,
    commentedAt: '2026-11-19T04:00:00.000000Z',
    ...overrides,
  };
}

describe('groupCommentsByPost', () => {
  it('groups comments by post, orders posts by their newest comment and reads each thread oldest first', () => {
    const posts = groupCommentsByPost([
      comment({ id: 'a3', externalPostId: 'post-2', commentedAt: '2026-11-19T06:00:00.000000Z' }),
      comment({ id: 'a2', commentedAt: '2026-11-19T05:00:00.000000Z' }),
      comment({ id: 'a1', commentedAt: '2026-11-19T04:00:00.000000Z' }),
    ]);
    expect(posts.map((post) => post.externalPostId)).toEqual(['post-2', 'post-1']);
    expect(posts[1]?.comments.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(posts[1]?.latestAt).toBe('2026-11-19T05:00:00.000000Z');
  });

  it('counts only comments that still wait for an answer', () => {
    const [post] = groupCommentsByPost([
      comment({ id: 'a' }),
      comment({ id: 'b', status: 'replied' }),
      comment({ id: 'c', status: 'hidden' }),
      comment({ id: 'd', status: 'needs_you' }),
    ]);
    expect(post?.toAnswer).toBe(2);
  });
});
