import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createPostSchema, editPostSchema, schedulePostSchema } from './social';

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

  it('keeps omitted fields out of a draft edit', () => {
    expect(editPostSchema.parse({ caption: 'নতুন পাঞ্জাবি' })).toEqual({
      caption: 'নতুন পাঞ্জাবি',
    });
  });
});

describe('post scheduling', () => {
  it('normalizes a scheduled time to UTC before it enters the service', () => {
    expect(schedulePostSchema.parse({ scheduledFor: '2099-11-20T20:30:00+06:00' })).toEqual({
      scheduledFor: '2099-11-20T14:30:00.000Z',
    });
  });

  it('rejects a timestamp when its UTC year cannot be stored in a scheduled event', () => {
    expect(
      schedulePostSchema.safeParse({ scheduledFor: '9999-12-31T23:59:59-06:00' }).success,
    ).toBe(false);
  });
});
