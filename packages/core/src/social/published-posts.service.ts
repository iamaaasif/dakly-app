import { Inject, Injectable } from '@nestjs/common';

import { PublishedPostsRepository } from './published-posts.repository';

@Injectable()
export class PublishedPostsService {
  constructor(
    @Inject(PublishedPostsRepository) private readonly published: PublishedPostsRepository,
  ) {}

  async content(storeId: string, target: { channelConnectionId: string; externalPostId: string }) {
    const post = await this.published.publishedPostContent(storeId, target);
    if (post)
      return { caption: post.captionOverride ?? post.caption, mediaFileIds: post.mediaFileIds };
  }
}
