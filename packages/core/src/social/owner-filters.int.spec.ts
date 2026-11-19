import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SocialRepository } from './social.repository';

describe('SocialRepository', () => {
  const fixture = new OwnerIsolationFixture();
  const repository = new SocialRepository(fixture.tenant);

  beforeAll(() => fixture.setup());
  afterAll(() => fixture.close());

  it('lists, finds and edits drafts only in the requested store without relying on RLS', async () => {
    const { a, b, userA, userB } = fixture;
    const now = new Date('2026-11-19T09:00:00Z');
    const fields = {
      caption: 'নতুন পাঞ্জাবি',
      kind: 'post',
      mediaFileIds: [],
      firstComment: null,
      linkUrl: null,
      isAiWritten: false,
      createdAt: now,
      updatedAt: now,
      createKey: randomUUID(),
      createFingerprint: 'fingerprint',
    } as const;
    const own = await repository.insertPost(a, {
      ...fields,
      mediaFileIds: [],
      createdByUserId: userA,
    });
    const other = await repository.insertPost(b, {
      ...fields,
      mediaFileIds: [],
      createdByUserId: userB,
    });
    expect(own).toBeDefined();
    expect(other).toBeDefined();
    const ownId = own!.id;
    expect(await repository.findPost(b, ownId)).toBeUndefined();
    expect(await repository.listPosts(b, { limit: 50, drafts: 'team' }, userB)).toMatchObject([
      { post: { id: other!.id } },
    ]);
    expect(await repository.findCreateKey(b, userA, fields.createKey)).toBeUndefined();
    expect(
      await repository.updatePost(b, ownId, { caption: 'ঈদ', updatedAt: now }),
    ).toBeUndefined();
    expect(await repository.findPost(a, ownId)).toMatchObject({
      post: { caption: fields.caption },
    });
  });
});
