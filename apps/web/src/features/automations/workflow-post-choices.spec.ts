import { describe, expect, it } from 'vitest';

import type { PostResponse } from '@dakly/contracts/social';

import { mergePostChoices } from './workflow-post-choices';

function post(caption: string, externalPostIds: (string | null)[]) {
  return {
    caption,
    photos: [{ id: 'photo', url: 'https://files.test/photo.jpg' }],
    targets: externalPostIds.map((externalPostId) => ({ externalPostId })),
  } as unknown as PostResponse;
}

describe('mergePostChoices', () => {
  it('lists published posts with a photo, then posts seen only in comments', () => {
    const choices = mergePostChoices(
      [post('নতুন শাড়ি', ['fb_1', null])],
      [
        { externalPostId: 'fb_1', postCaption: 'old caption' },
        { externalPostId: 'ig_9', postCaption: null },
        { externalPostId: 'ig_9', postCaption: null },
      ],
    );
    expect(choices).toEqual([
      { externalPostId: 'fb_1', caption: 'নতুন শাড়ি', photoUrl: 'https://files.test/photo.jpg' },
      { externalPostId: 'ig_9', caption: null, photoUrl: null },
    ]);
  });
});
