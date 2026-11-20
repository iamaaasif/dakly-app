import { Inject, Injectable } from '@nestjs/common';

import type { PostResponse, ReschedulePostInput } from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { TeamService } from '../team/team.service';
import { socialError } from './social.errors';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

type Editor = { actor: { kind: 'user'; userId: string }; access: StoreAccess };

// Moves the scheduled targets of a post to a new time. The old publish jobs find no target at
// their time and do nothing, so the new post.scheduled event is all the queue needs.
@Injectable()
export class SocialRescheduleService {
  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(SocialService) private readonly social: SocialService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async reschedulePost(
    storeId: string,
    postId: string,
    input: ReschedulePostInput,
    { actor, access }: Editor,
  ): Promise<PostResponse> {
    await this.transaction.runLocked(storeId, async () => {
      const found = await this.repository.findPost(storeId, postId);
      if (!found) throw socialError('POST_NOT_FOUND');
      const { post, targets } = found;
      if (post.createdByUserId !== actor.userId && !this.team.canReviewSocialPosts(access, 'view'))
        throw socialError('POST_NOT_FOUND');
      const movable = targets.filter(({ status }) => status === 'scheduled');
      if (!movable.length) throw socialError('POST_NOT_SCHEDULED');
      // Scheduling approves on the way in, so an unapproved AI post is never scheduled.
      if (post.isAiWritten && !post.approvedAt) throw socialError('POST_APPROVAL_REQUIRED');
      const now = this.clock.now();
      const scheduledFor = new Date(input.scheduledFor);
      if (scheduledFor <= now) throw socialError('POST_TIME_IN_PAST');
      const alreadyThere = movable.filter(
        (target) => target.scheduledFor?.getTime() === scheduledFor.getTime(),
      );
      const moved = movable.filter((target) => !alreadyThere.includes(target));
      if (!moved.length) return;
      const reserved = await this.repository.reservedTimes(
        storeId,
        moved.map(({ channelConnectionId }) => channelConnectionId),
        { from: scheduledFor, through: scheduledFor },
      );
      if (reserved.length) throw socialError('POST_SLOT_TAKEN');
      const ids = moved.map(({ id }) => id);
      await this.repository.moveScheduledTargets(storeId, ids, scheduledFor, now);
      await this.audit.record(storeId, {
        actor,
        action: 'post.rescheduled',
        entityType: 'post',
        entityId: postId,
        after: { ids, state: 'scheduled' },
      });
      await this.outbox.publishAll(
        ids.map((postTargetId) => ({
          storeId,
          type: 'post.scheduled',
          occurredAt: now.toISOString(),
          payload: { postId, postTargetId, scheduledFor: scheduledFor.toISOString() },
        })),
      );
    });
    return this.social.getPost(storeId, postId, actor, access);
  }
}
