import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, lte } from 'drizzle-orm';

import { posts, postTargets } from '@dakly/db/schema/social';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class SocialInsightsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async findMetricsTarget(storeId: string, postTargetId: string, now: Date) {
    const [match] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: postTargets.id,
          channelConnectionId: postTargets.channelConnectionId,
          externalPostId: postTargets.externalPostId,
          publishedAt: postTargets.publishedAt,
          nextMetricsAt: postTargets.nextMetricsAt,
          postKind: posts.kind,
        })
        .from(postTargets)
        .innerJoin(posts, and(eq(posts.id, postTargets.postId), eq(posts.storeId, storeId)))
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.id, postTargetId),
            eq(postTargets.status, 'published'),
            isNotNull(postTargets.externalPostId),
            isNotNull(postTargets.publishedAt),
            lte(postTargets.nextMetricsAt, now),
          ),
        ),
    );
    return match;
  }

  // Compares the due time the job read, so a duplicate delivery changes nothing.
  async saveMetrics(
    storeId: string,
    postTargetId: string,
    dueAt: Date,
    changes: Partial<
      Pick<
        typeof postTargets.$inferInsert,
        'reach' | 'reactions' | 'comments' | 'shares' | 'metricsAt' | 'nextMetricsAt'
      >
    >,
  ) {
    const [saved] = await this.database.forStore(storeId, (tx) =>
      tx
        .update(postTargets)
        .set(changes)
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.id, postTargetId),
            eq(postTargets.nextMetricsAt, dueAt),
          ),
        )
        .returning({ id: postTargets.id }),
    );
    return saved !== undefined;
  }
}
