import type { CommentResponse } from '@dakly/contracts/comments';

export type CommentPost = {
  externalPostId: string;
  channel: CommentResponse['channel'];
  caption: string | null;
  latestAt: string;
  // Comments nobody answered yet and that are not hidden.
  toAnswer: number;
  // Oldest first, the way a thread reads.
  comments: CommentResponse[];
};

// The API lists newest first, so the first comment seen for a post sets its place in the list.
export function groupCommentsByPost(comments: CommentResponse[]): CommentPost[] {
  const posts = new Map<string, CommentPost>();
  for (const comment of comments) {
    const post = posts.get(comment.externalPostId) ?? {
      externalPostId: comment.externalPostId,
      channel: comment.channel,
      caption: comment.postCaption,
      latestAt: comment.commentedAt,
      toAnswer: 0,
      comments: [],
    };
    post.comments.unshift(comment);
    if (comment.status === 'new' || comment.status === 'needs_you') post.toAnswer += 1;
    posts.set(comment.externalPostId, post);
  }
  return [...posts.values()];
}
