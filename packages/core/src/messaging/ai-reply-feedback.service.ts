import { Inject, Injectable } from '@nestjs/common';

import {
  aiRatingReasons,
  type AiFeedbackQuery,
  type AiFeedbackResponse,
  type FixAiReplyInput,
  type RateAiReplyInput,
} from '@dakly/contracts/ai-feedback';
import type { AuditEntry } from '@dakly/contracts/audit';

import { TaughtAnswersService } from '../ai/taught-answers.service';
import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { AiReplyFeedbackRepository } from './ai-reply-feedback.repository';
import { messagingError } from './messaging.errors';

type Actor = Extract<AuditEntry['actor'], { kind: 'user' }>;

@Injectable()
export class AiReplyFeedbackService {
  constructor(
    @Inject(AiReplyFeedbackRepository) private readonly repository: AiReplyFeedbackRepository,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TaughtAnswersService) private readonly taughtAnswers: TaughtAnswersService,
  ) {}

  rate(storeId: string, actor: Actor, messageId: string, input: RateAiReplyInput) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      const rated = await this.repository.rate(storeId, messageId, {
        userId: actor.userId,
        input,
        now: this.clock.now(),
      });
      if (!rated) throw messagingError('AI_REPLY_NOT_FOUND');
      await this.audit.record(storeId, {
        actor,
        action: 'ai_reply.rated',
        entityType: 'message',
        entityId: messageId,
        after: { state: input.rating },
      });
    });
  }

  // The right answer becomes a taught answer, so the next customer who asks gets it.
  fix(storeId: string, actor: Actor, messageId: string, input: FixAiReplyInput) {
    return this.transaction.run(storeId, async () => {
      await this.requireChats(storeId);
      const reply = await this.repository.findAiReply(storeId, messageId);
      if (!reply) throw messagingError('AI_REPLY_NOT_FOUND');
      if (reply.rating !== 'bad') throw messagingError('AI_REPLY_NOT_BAD');
      if (reply.fixedAt) throw messagingError('AI_REPLY_ALREADY_FIXED');
      const item = await this.taughtAnswers.teach(storeId, actor, input);
      await this.repository.markFixed(storeId, messageId, this.clock.now());
      await this.audit.record(storeId, {
        actor,
        action: 'ai_reply.fixed',
        entityType: 'message',
        entityId: messageId,
        after: { ids: [item.id] },
      });
    });
  }

  async feedback(storeId: string, query: AiFeedbackQuery): Promise<AiFeedbackResponse> {
    await this.requireChats(storeId);
    const [counts, rows] = await Promise.all([
      this.repository.counts(storeId),
      this.repository.list(storeId, query),
    ]);
    const total = (rating: 'good' | 'bad') =>
      counts.filter((row) => row.rating === rating).reduce((sum, row) => sum + row.count, 0);
    const goodCount = total('good');
    const badCount = total('bad');
    const rated = goodCount + badCount;
    const fixedCount = counts.reduce((sum, row) => sum + row.fixed, 0);
    return {
      summary: {
        helpfulPercent: rated === 0 ? null : Math.round((goodCount / rated) * 100),
        goodCount,
        badCount,
        fixedCount,
        commonProblems: aiRatingReasons
          .map((reason) => ({
            reason,
            count: counts
              .filter((row) => row.rating === 'bad' && row.reason === reason)
              .reduce((sum, row) => sum + row.count, 0),
          }))
          .filter((problem) => problem.count > 0)
          .sort((a, b) => b.count - a.count),
      },
      items: rows.flatMap(({ ratedAt, fixedAt, rating, reason, ...row }) =>
        ratedAt && rating
          ? [
              {
                ...row,
                rating,
                reason: aiRatingReasons.find((known) => known === reason) ?? null,
                fixedAt: fixedAt?.toISOString() ?? null,
                ratedAt: ratedAt.toISOString(),
              },
            ]
          : [],
      ),
    };
  }

  private async requireChats(storeId: string) {
    const { extensions } = await this.stores.settings(storeId);
    if (!extensions.includes('chats')) throw messagingError('CHATS_DISABLED');
  }
}
