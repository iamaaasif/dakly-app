import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { posts, postTargets } from '@dakly/db/schema/social';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class PublishedPostsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async publishedPostContent(
    storeId: string,
    {
      channelConnectionId,
      externalPostId,
    }: { channelConnectionId: string; externalPostId: string },
  ) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({
          caption: posts.caption,
          captionOverride: postTargets.captionOverride,
          mediaFileIds: posts.mediaFileIds,
        })
        .from(postTargets)
        .innerJoin(posts, and(eq(posts.storeId, storeId), eq(posts.id, postTargets.postId)))
        .where(
          and(
            eq(postTargets.storeId, storeId),
            eq(postTargets.channelConnectionId, channelConnectionId),
            eq(postTargets.externalPostId, externalPostId),
            eq(postTargets.status, 'published'),
            isNull(posts.deletedAt),
          ),
        ),
    );
    return row;
  }
}
