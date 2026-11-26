import { z } from 'zod';

import {
  MetaPublishingError,
  type InstagramContainerState,
  type MetaPost,
  type MetaPostMetrics,
  type MetaPostRef,
  type MetaPostingAccount,
  type MetaPublishingDriver,
} from '../meta-publishing-driver';

const graph = 'https://graph.facebook.com/v27.0/';
const requestTimeoutMs = 5_000;
const idResult = z.object({ id: z.string().min(1) });
const storyResult = z.object({ post_id: z.string().min(1) });
const errorResult = z.object({
  error: z.object({
    code: z.number(),
    error_subcode: z.number().optional(),
    message: z.string().optional(),
    is_transient: z.boolean().optional(),
  }),
});
const retryableCodes = [1, 2, 4, 17, 32, 613, 80001, 80002];
const containerStates = {
  IN_PROGRESS: 'processing',
  FINISHED: 'ready',
  PUBLISHED: 'published',
  ERROR: 'failed',
  EXPIRED: 'failed',
} satisfies Record<string, InstagramContainerState>;
const count = z.number().int().nonnegative();
const insightsResult = z.object({
  data: z.array(z.object({ name: z.string(), values: z.array(z.object({ value: count })) })),
});
const facebookCounts = z.object({
  reactions: z.object({ summary: z.object({ total_count: count }) }),
  comments: z.object({ summary: z.object({ total_count: count }) }),
  shares: z.object({ count }).optional(),
});
const instagramCounts = z.object({ like_count: count, comments_count: count });
const containerResult = z.object({
  status_code: z.enum(['IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED']),
});

function responseError(status: number, payload: unknown) {
  if (status === 401) return new MetaPublishingError('auth_error');
  const parsed = errorResult.safeParse(payload);
  if (!parsed.success) return new MetaPublishingError('unavailable');
  const { error } = parsed.data;
  const detail = {
    code: error.code,
    subcode: error.error_subcode ?? null,
    message: (error.message ?? '').slice(0, 300),
  };
  return new MetaPublishingError(errorKind(status, error), detail);
}

function errorKind(status: number, error: z.infer<typeof errorResult>['error']) {
  if ([190, 459].includes(error.code)) return 'auth_error';
  if (status < 400 || status === 408 || status >= 500) return 'unavailable';
  const retryable = status === 429 || error.is_transient || retryableCodes.includes(error.code);
  return retryable ? 'retryable' : 'rejected';
}

function insightMetrics({ kind, isStory }: MetaPostRef) {
  if (kind === 'facebook_page') return 'post_total_media_view_unique';
  return isStory ? 'reach' : 'reach,shares';
}

function insightValue(insights: z.infer<typeof insightsResult>, name: string) {
  return insights.data.find((metric) => metric.name === name)?.values[0]?.value ?? null;
}

export class MetaGraphPublishingDriver implements MetaPublishingDriver {
  async uploadFacebookPhotos(account: MetaPostingAccount, photoUrls: string[]) {
    return Promise.all(
      photoUrls.map(async (url) => {
        const uploaded = await this.request(
          account,
          `${encodeURIComponent(account.accountId)}/photos`,
          idResult,
          {
            url,
            published: false,
          },
        );
        return uploaded.id;
      }),
    );
  }

  async publishFacebook(account: MetaPostingAccount, post: MetaPost, photoIds: string[]) {
    const page = encodeURIComponent(account.accountId);
    if (post.kind === 'story') {
      const story = await this.request(account, `${page}/photo_stories`, storyResult, {
        photo_id: photoIds[0],
      });
      return story.post_id;
    }
    const published = await this.request(account, `${page}/feed`, idResult, {
      message: post.caption,
      ...(post.linkUrl ? { link: post.linkUrl } : {}),
      ...(photoIds.length ? { attached_media: photoIds.map((id) => ({ media_fbid: id })) } : {}),
    });
    return published.id;
  }

  async createInstagramContainer(account: MetaPostingAccount, post: MetaPost) {
    const path = `${encodeURIComponent(account.accountId)}/media`;
    if (post.photoUrls.length > 1) {
      const children = await Promise.all(
        post.photoUrls.map(async (image_url) => {
          const child = await this.request(account, path, idResult, {
            image_url,
            is_carousel_item: true,
          });
          return child.id;
        }),
      );
      const container = await this.request(account, path, idResult, {
        caption: post.caption,
        media_type: 'CAROUSEL',
        children: children.join(','),
      });
      return container.id;
    }
    const container = await this.request(account, path, idResult, {
      image_url: post.photoUrls[0],
      ...(post.kind === 'story' ? { media_type: 'STORIES' } : { caption: post.caption }),
    });
    return container.id;
  }

  async instagramContainerState(account: MetaPostingAccount, containerId: string) {
    const path = `${encodeURIComponent(containerId)}?fields=status_code`;
    const container = await this.request(account, path, containerResult);
    return containerStates[container.status_code];
  }

  async publishInstagram(account: MetaPostingAccount, containerId: string) {
    const published = await this.request(
      account,
      `${encodeURIComponent(account.accountId)}/media_publish`,
      idResult,
      {
        creation_id: containerId,
      },
    );
    return published.id;
  }

  async comment(account: MetaPostingAccount, postId: string, message: string) {
    await this.request(account, `${encodeURIComponent(postId)}/comments`, idResult, { message });
  }

  async postMetrics(account: MetaPostingAccount, post: MetaPostRef): Promise<MetaPostMetrics> {
    const id = encodeURIComponent(post.externalPostId);
    const counts = await this.counts(account, id, post);
    const metrics = insightMetrics(post);
    // A rejected metric name must not lose the counts.
    const insights = await this.request(
      account,
      `${id}/insights?metric=${metrics}`,
      insightsResult,
    ).catch((failure: unknown) => {
      if (failure instanceof MetaPublishingError && failure.code === 'rejected') return null;
      throw failure;
    });
    return {
      ...counts,
      reach: insights && insightValue(insights, post.kind === 'facebook_page' ? metrics : 'reach'),
      shares: counts.shares ?? (insights && insightValue(insights, 'shares')),
      rejectedInsights: insights ? null : metrics,
    };
  }

  // Stories have no likes or comments counts and expire after a day.
  private async counts(account: MetaPostingAccount, id: string, post: MetaPostRef) {
    if (post.isStory) return { reactions: null, comments: null, shares: null };
    return post.kind === 'facebook_page'
      ? this.facebookCounts(account, id)
      : this.instagramCounts(account, id);
  }

  private async facebookCounts(account: MetaPostingAccount, id: string) {
    const counts = await this.request(
      account,
      `${id}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares`,
      facebookCounts,
    );
    return {
      reactions: counts.reactions.summary.total_count,
      comments: counts.comments.summary.total_count,
      shares: counts.shares?.count ?? 0,
    };
  }

  private async instagramCounts(account: MetaPostingAccount, id: string) {
    const counts = await this.request(
      account,
      `${id}?fields=like_count,comments_count`,
      instagramCounts,
    );
    return { reactions: counts.like_count, comments: counts.comments_count, shares: null };
  }

  private async request<T>(
    account: MetaPostingAccount,
    path: string,
    schema: z.ZodType<T>,
    body?: object,
  ): Promise<T> {
    const response = await fetch(new URL(path, graph), {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(requestTimeoutMs),
    }).catch(() => {
      throw new MetaPublishingError('unavailable');
    });
    const payload: unknown = await response
      .text()
      .then((text): unknown =>
        JSON.parse(text, (key, value: unknown, context?: { source: string }) =>
          // Meta returns a numeric story ID. Its original digits may exceed JavaScript's safe integer range.
          key === 'post_id' && typeof value === 'number' ? context?.source : value,
        ),
      )
      .catch(() => null);
    if (!response.ok) throw responseError(response.status, payload);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new MetaPublishingError('unavailable');
    return parsed.data;
  }
}
