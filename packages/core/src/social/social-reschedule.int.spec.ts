import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PostResponse } from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { AuditService } from '../audit/audit.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { TeamService } from '../team/team.service';
import { SocialRescheduleRepository } from './social-reschedule.repository';
import { SocialRescheduleService } from './social-reschedule.service';
import { SocialRepository } from './social.repository';
import type { SocialService } from './social.service';

describe('SocialRescheduleService', () => {
  const fixture = new OwnerIsolationFixture();
  const now = new Date('2026-11-20T06:00:00Z');
  const publishAll = vi.fn(async () => undefined);
  const record = vi.fn(async () => undefined);

  beforeAll(() => fixture.setup());
  afterAll(() => fixture.close());

  function service(canReview = false) {
    return new SocialRescheduleService(
      new SocialRepository(fixture.tenant),
      new SocialRescheduleRepository(fixture.tenant),
      { getPost: async () => ({}) as PostResponse } as unknown as SocialService,
      { canReviewSocialPosts: () => canReview } as unknown as TeamService,
      new StoreTransaction(fixture.tenant),
      { record } as unknown as AuditService,
      { now: () => now },
      { publishAll } as unknown as OutboxService,
    );
  }

  async function scheduledPost({
    status = 'scheduled',
    at = '2026-11-21T14:30:00Z',
    aiWritten = false,
    creator = fixture.userA,
  } = {}) {
    const connection = randomUUID();
    await fixture.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,'facebook_page',$1::text,'Page')",
      [connection, fixture.a],
    );
    const post = randomUUID();
    await fixture.connection.pool.query(
      'insert into posts(id,store_id,caption,created_by_user_id,is_ai_written) values($1,$2,$3,$4,$5)',
      [post, fixture.a, 'Eid sale', creator, aiWritten],
    );
    const target = randomUUID();
    await fixture.connection.pool.query(
      'insert into post_targets(id,store_id,post_id,channel_connection_id,status,scheduled_for) values($1,$2,$3,$4,$5,$6)',
      [target, fixture.a, post, connection, status, at],
    );
    return { post, target, connection };
  }

  const editor = (userId = fixture.userA) => ({
    actor: { kind: 'user' as const, userId },
    access: {} as StoreAccess,
  });
  const scheduledFor = async (target: string) =>
    (
      await fixture.connection.pool.query('select scheduled_for from post_targets where id=$1', [
        target,
      ])
    ).rows[0].scheduled_for.toISOString();

  it('moves a scheduled target to the new time and announces it for the queue', async () => {
    const { post, target } = await scheduledPost();

    await service().reschedulePost(
      fixture.a,
      post,
      { scheduledFor: '2026-11-23T14:30:00.000Z' },
      editor(),
    );

    expect(await scheduledFor(target)).toBe('2026-11-23T14:30:00.000Z');
    expect(publishAll).toHaveBeenLastCalledWith([
      expect.objectContaining({
        type: 'post.scheduled',
        payload: { postId: post, postTargetId: target, scheduledFor: '2026-11-23T14:30:00.000Z' },
      }),
    ]);
  });

  it('refuses a time in the past, a taken slot, a published post and an unapproved AI post', async () => {
    const free = await scheduledPost();
    const taken = await scheduledPost({ at: '2026-11-25T14:30:00Z' });
    await fixture.connection.pool.query(
      'update post_targets set channel_connection_id=$1 where id=$2',
      [free.connection, taken.target],
    );
    const published = await scheduledPost({ status: 'published' });
    const ai = await scheduledPost({ aiWritten: true });
    const move = (post: string, at: string) =>
      service().reschedulePost(fixture.a, post, { scheduledFor: at }, editor());

    await expect(move(free.post, '2026-11-20T05:00:00.000Z')).rejects.toMatchObject({
      code: 'POST_TIME_IN_PAST',
    });
    await expect(move(free.post, '2026-11-25T14:30:00.000Z')).rejects.toMatchObject({
      code: 'POST_SLOT_TAKEN',
    });
    await expect(move(published.post, '2026-11-27T14:30:00.000Z')).rejects.toMatchObject({
      code: 'POST_NOT_SCHEDULED',
    });
    await expect(move(ai.post, '2026-11-27T14:30:00.000Z')).rejects.toMatchObject({
      code: 'POST_APPROVAL_REQUIRED',
    });
    expect(await scheduledFor(free.target)).toBe('2026-11-21T14:30:00.000Z');
  });

  it('hides another person’s post unless the editor can review posts', async () => {
    const { post } = await scheduledPost({ creator: fixture.userB });
    const at = { scheduledFor: '2026-11-24T14:30:00.000Z' };

    await expect(service().reschedulePost(fixture.a, post, at, editor())).rejects.toMatchObject({
      code: 'POST_NOT_FOUND',
    });
    await expect(
      service(true).reschedulePost(fixture.a, post, at, editor()),
    ).resolves.toBeDefined();
  });
});
