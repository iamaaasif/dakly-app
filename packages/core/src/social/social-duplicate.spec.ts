import { describe, expect, it } from 'vitest';

import type { StoreAccess } from '@dakly/contracts/team';

import { SocialService } from './social.service';

describe('SocialService duplicatePost', () => {
  const draft = {
    post: { id: 'post-1', createdByUserId: 'creator', mediaFileIds: [] },
    targets: [{ id: 'target-1', status: 'draft', scheduledFor: null }],
  };

  function service(canReview: boolean) {
    const unused = {} as never;
    return new SocialService(
      { findPost: async () => draft } as never,
      unused,
      { canReviewSocialPosts: () => canReview } as never,
      unused,
      unused,
      { now: () => new Date('2026-11-27T06:00:00Z') },
      unused,
      unused,
      unused,
    );
  }

  it('hides another person private draft from a member who cannot review team drafts', async () => {
    await expect(
      service(false).duplicatePost(
        'store',
        'post-1',
        { kind: 'user', userId: 'someone-else' },
        {} as StoreAccess,
      ),
    ).rejects.toMatchObject({ code: 'POST_NOT_FOUND' });
  });
});
