import { Inject, Injectable } from '@nestjs/common';

import { SocialAnalyticsRepository } from './social-analytics.repository';

export type PublishedPost = {
  id: string;
  caption: string;
  networks: string[];
  publishedAt: Date;
  reach: number | null;
  reactions: number | null;
  comments: number | null;
  linkTaps: number | null;
};

@Injectable()
export class SocialAnalyticsService {
  constructor(
    @Inject(SocialAnalyticsRepository) private readonly repository: SocialAnalyticsRepository,
  ) {}

  // One row per post: a post sent to Facebook and Instagram adds its networks and numbers together.
  async publishedBetween(
    storeId: string,
    range: { from: string; through: string; timeZone: string },
  ): Promise<PublishedPost[]> {
    const targets = await this.repository.publishedBetween(storeId, range);
    const byPost = new Map<string, PublishedPost>();
    for (const target of targets) {
      const post = byPost.get(target.postId);
      if (!post) {
        byPost.set(target.postId, {
          id: target.postId,
          caption: target.caption,
          networks: [target.network],
          publishedAt: target.publishedAt!,
          reach: target.reach,
          reactions: target.reactions,
          comments: target.comments,
          linkTaps: target.linkTaps,
        });
        continue;
      }
      post.networks.push(target.network);
      post.reach = add(post.reach, target.reach);
      post.reactions = add(post.reactions, target.reactions);
      post.comments = add(post.comments, target.comments);
      post.linkTaps = add(post.linkTaps, target.linkTaps);
    }
    return [...byPost.values()];
  }
}

// Meta has not reported a number yet when it is null; it stays null until some target reports.
function add(total: number | null, value: number | null) {
  return total === null && value === null ? null : (total ?? 0) + (value ?? 0);
}
