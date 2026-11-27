import type { CommentResponse } from '@dakly/contracts/comments';
import type { PostResponse } from '@dakly/contracts/social';

export type PostChoice = {
  externalPostId: string;
  caption: string | null;
  photoUrl: string | null;
};

// Posts the shop published through Dakly come first, with their photo. Posts that only exist on
// Facebook or Instagram appear once a customer has commented on them.
export function mergePostChoices(
  posts: readonly PostResponse[],
  comments: readonly Pick<CommentResponse, 'externalPostId' | 'postCaption'>[],
): PostChoice[] {
  const choices = new Map<string, PostChoice>();
  for (const post of posts) {
    for (const { externalPostId } of post.targets) {
      if (externalPostId && !choices.has(externalPostId)) {
        choices.set(externalPostId, {
          externalPostId,
          caption: post.caption,
          photoUrl: post.photos[0]?.url ?? null,
        });
      }
    }
  }
  for (const { externalPostId, postCaption } of comments) {
    if (!choices.has(externalPostId)) {
      choices.set(externalPostId, { externalPostId, caption: postCaption, photoUrl: null });
    }
  }
  return [...choices.values()];
}
