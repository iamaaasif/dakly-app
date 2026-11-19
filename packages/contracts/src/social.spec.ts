import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createPostSchema, editPostSchema, postIdempotencyKeySchema } from './social';

describe('post drafts', () => {
  it('keeps an empty caption override separate from a missing common caption', () => {
    const targets = [{ channelConnectionId: randomUUID(), captionOverride: '' }];
    expect(createPostSchema.parse({ targets })).toMatchObject({ caption: null, targets });
  });

  it('rejects two targets for the same connection', () => {
    const target = { channelConnectionId: randomUUID(), captionOverride: null };
    expect(createPostSchema.safeParse({ targets: [target, target] }).success).toBe(false);
    expect(editPostSchema.safeParse({ targets: [target, target] }).success).toBe(false);
  });

  it('treats case variants of a connection ID as the same target', () => {
    const channelConnectionId = randomUUID();
    const targets = [channelConnectionId, channelConnectionId.toUpperCase()].map((id) => ({
      channelConnectionId: id,
      captionOverride: null,
    }));
    expect(createPostSchema.safeParse({ targets }).success).toBe(false);
  });

  it('rejects null characters in text saved to a post', () => {
    expect(createPostSchema.safeParse({ caption: 'new\0post' }).success).toBe(false);
    expect(createPostSchema.safeParse({ linkUrl: 'https://example.test/\0' }).success).toBe(false);
    expect(editPostSchema.safeParse({ firstComment: 'new\0comment' }).success).toBe(false);
  });

  it('trims create keys and accepts up to 128 characters', () => {
    expect(postIdempotencyKeySchema.parse(' key ')).toBe('key');
    expect(postIdempotencyKeySchema.safeParse('x'.repeat(128)).success).toBe(true);
    expect(postIdempotencyKeySchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('keeps omitted fields out of a draft edit', () => {
    expect(editPostSchema.parse({ caption: 'নতুন পাঞ্জাবি' })).toEqual({
      caption: 'নতুন পাঞ্জাবি',
    });
  });
});
