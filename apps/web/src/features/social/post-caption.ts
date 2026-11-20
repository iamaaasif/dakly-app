import type { CreatePostInput } from '@dakly/contracts/social';

export function captionFor(post: CreatePostInput, channelConnectionId: string): string {
  const target = post.targets.find((item) => item.channelConnectionId === channelConnectionId);
  return target?.captionOverride ?? post.caption ?? '';
}
