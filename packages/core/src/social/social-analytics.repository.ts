import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import { channelConnections } from '@dakly/db/schema/channels';
import { posts, postTargets } from '@dakly/db/schema/social';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class SocialAnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Published targets in the shop-local day range, one row per target; the service groups them by post.
  publishedBetween(
    storeId: string,
    { from, through, timeZone }: { from: string; through: string; timeZone: string },
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          postId: posts.id,
          caption: sql<string>`coalesce(${postTargets.captionOverride}, ${posts.caption}, '')`,
          network: channelConnections.kind,
          publishedAt: postTargets.publishedAt,
          reach: postTargets.reach,
          reactions: postTargets.reactions,
          comments: postTargets.comments,
          linkTaps: postTargets.linkTaps,
        })
        .from(postTargets)
        .innerJoin(posts, and(eq(posts.storeId, storeId), eq(posts.id, postTargets.postId)))
        .innerJoin(
          channelConnections,
          and(
            eq(channelConnections.storeId, storeId),
            eq(channelConnections.id, postTargets.channelConnectionId),
          ),
        )
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.status, 'published'),
            isNotNull(postTargets.publishedAt),
            gte(postTargets.publishedAt, sql`(${from}::date)::timestamp at time zone ${timeZone}`),
            lt(
              postTargets.publishedAt,
              sql`(${through}::date + 1)::timestamp at time zone ${timeZone}`,
            ),
          ),
        )
        .orderBy(asc(postTargets.publishedAt)),
    );
  }
}
