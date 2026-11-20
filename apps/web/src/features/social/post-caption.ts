import type { CreatePostInput } from '@dakly/contracts/social';

const MAX_HASHTAGS = 5;

const plainWords = new Set([
  'about',
  'there',
  'their',
  'these',
  'those',
  'where',
  'which',
  'would',
  'weekend',
  'today',
  'starts',
]);

// Words of five letters or more from the caption become hashtags; no AI credits are used.
export function addHashtags(caption: string): string {
  const existing = new Set(caption.match(/#[\p{L}\p{N}_]+/gu)?.map((tag) => tag.toLowerCase()));
  const words = caption.replace(/#[\p{L}\p{N}_]+/gu, ' ').match(/[\p{L}\p{N}]{5,}/gu) ?? [];
  const tags: string[] = [];
  for (const word of words) {
    const tag = `#${word.toLowerCase()}`;
    if (!plainWords.has(tag.slice(1)) && !existing.has(tag) && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MAX_HASHTAGS) break;
  }
  return tags.length ? `${caption.trimEnd()}\n\n${tags.join(' ')}` : caption;
}

export function captionFor(post: CreatePostInput, channelConnectionId: string): string {
  const target = post.targets.find((item) => item.channelConnectionId === channelConnectionId);
  return target?.captionOverride ?? post.caption ?? '';
}
