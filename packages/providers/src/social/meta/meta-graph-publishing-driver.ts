import { z } from 'zod';

import {
  MetaPublishingError,
  type InstagramContainerState,
  type MetaPost,
  type MetaPostingAccount,
  type MetaPublishingDriver,
} from '../meta-publishing-driver';

const graph = 'https://graph.facebook.com/v27.0/';
const requestTimeoutMs = 5_000;
const idResult = z.object({ id: z.string().min(1) });
const storyResult = z.object({ post_id: z.string().min(1) });
const errorResult = z.object({
  error: z.object({ code: z.number(), is_transient: z.boolean().optional() }),
});
const retryableCodes = [1, 2, 4, 17, 32, 613, 80001, 80002];
const containerStates = {
  IN_PROGRESS: 'processing',
  FINISHED: 'ready',
  PUBLISHED: 'published',
  ERROR: 'failed',
  EXPIRED: 'failed',
} satisfies Record<string, InstagramContainerState>;
const containerResult = z.object({
  status_code: z.enum(['IN_PROGRESS', 'FINISHED', 'PUBLISHED', 'ERROR', 'EXPIRED']),
});

function responseError(status: number, payload: unknown) {
  const error = errorResult.safeParse(payload).data?.error;
  if (status === 401 || [190, 459].includes(error?.code ?? 0))
    return new MetaPublishingError('auth_error');
  if (!error || status < 400 || status === 408 || status >= 500)
    return new MetaPublishingError('unavailable');
  const retryable = status === 429 || error.is_transient || retryableCodes.includes(error.code);
  return new MetaPublishingError(retryable ? 'retryable' : 'rejected');
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
