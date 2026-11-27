import type { CreatePostInput, PostResponse } from '@dakly/contracts/social';

import type { SocialRepository } from './social.repository';

type Post = NonNullable<Awaited<ReturnType<SocialRepository['findPost']>>>['post'];
type Target = Awaited<ReturnType<SocialRepository['listTargets']>>[number];

type Photo = PostResponse['photos'][number];

export function response(post: Post, targets: Target[], photos: Photo[]): PostResponse {
  return {
    ...post,
    photos,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    approvedAt: post.approvedAt?.toISOString() ?? null,
    targets: targets.map(({ postId: _postId, scheduledFor, publishedAt, ...target }) => ({
      ...target,
      scheduledFor: scheduledFor?.toISOString() ?? null,
      publishedAt: publishedAt?.toISOString() ?? null,
    })),
  };
}

// A photo that is no longer ready is left out so the card still renders.
export function photosOf(post: Post, urls: Map<string, string>): Photo[] {
  return post.mediaFileIds.flatMap((id) => {
    const url = urls.get(id);
    return url ? [{ id, url }] : [];
  });
}

export function copyOf(source: PostResponse): CreatePostInput {
  const { kind, caption, mediaFileIds, linkUrl, firstComment, isAiWritten } = source;
  const targets = source.targets.map(({ channelConnectionId, captionOverride }) => ({
    channelConnectionId,
    captionOverride,
  }));
  return { kind, caption, mediaFileIds, linkUrl, firstComment, isAiWritten, targets };
}
