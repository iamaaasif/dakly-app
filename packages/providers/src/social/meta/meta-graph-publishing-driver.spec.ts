import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetaGraphPublishingDriver } from './meta-graph-publishing-driver';

const account = { accountId: '123', accessToken: 'test-page-token' };
const photoUrls = ['https://storage.test/one.jpg', 'https://storage.test/two.jpg'];
const content = { kind: 'post' as const, caption: 'ঈদ', linkUrl: null, photoUrls };

describe('MetaGraphPublishingDriver', () => {
  const driver = new MetaGraphPublishingDriver();
  afterEach(() => vi.unstubAllGlobals());

  it('uploads unpublished Facebook photos and then publishes them in one Page post', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'photo-1' }))
      .mockResolvedValueOnce(Response.json({ id: 'photo-2' }))
      .mockResolvedValueOnce(Response.json({ id: 'page-post' }));
    vi.stubGlobal('fetch', fetch);

    const photos = await driver.uploadFacebookPhotos(account, photoUrls);
    expect(await driver.publishFacebook(account, content, photos)).toBe('page-post');
    const [photo, , feed] = fetch.mock.calls;
    expect(new URL(photo![0]).pathname).toMatch(/\/123\/photos$/);
    expect(JSON.parse(photo![1].body)).toEqual({ url: photoUrls[0], published: false });
    expect(new URL(feed![0]).pathname).toMatch(/\/123\/feed$/);
    expect(feed![1].headers).toMatchObject({ Authorization: 'Bearer test-page-token' });
    expect(JSON.parse(feed![1].body)).toEqual({
      message: 'ঈদ',
      attached_media: [{ media_fbid: 'photo-1' }, { media_fbid: 'photo-2' }],
    });
  });

  it('creates Instagram carousel children and waits for the parent container to be ready', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'first' }))
      .mockResolvedValueOnce(Response.json({ id: 'second' }))
      .mockResolvedValueOnce(Response.json({ id: 'carousel' }))
      .mockResolvedValueOnce(Response.json({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(Response.json({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(Response.json({ id: 'ig-post' }));
    vi.stubGlobal('fetch', fetch);

    const container = await driver.createInstagramContainer(account, content);
    expect(container).toBe('carousel');
    expect(await driver.instagramContainerState(account, container)).toBe('processing');
    expect(await driver.instagramContainerState(account, container)).toBe('ready');
    expect(await driver.publishInstagram(account, container)).toBe('ig-post');
    const [first, , parent, status, , publish] = fetch.mock.calls;
    expect(JSON.parse(first![1].body)).toEqual({ image_url: photoUrls[0], is_carousel_item: true });
    expect(JSON.parse(parent![1].body)).toEqual({
      caption: 'ঈদ',
      media_type: 'CAROUSEL',
      children: 'first,second',
    });
    expect(new URL(status![0]).searchParams.get('fields')).toBe('status_code');
    expect(new URL(publish![0]).pathname).toMatch(/\/123\/media_publish$/);
    expect(JSON.parse(publish![1].body)).toEqual({ creation_id: 'carousel' });
  });

  it('publishes a Facebook story and preserves a numeric ID above the safe integer limit', async () => {
    const body = '{"success":true,"post_id":9007199254740993}';
    const fetch = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetch);

    await expect(
      driver.publishFacebook(account, { ...content, kind: 'story' }, ['photo']),
    ).resolves.toBe('9007199254740993');
    const [[url, options]] = fetch.mock.calls;
    expect(new URL(url).pathname).toMatch(/\/123\/photo_stories$/);
    expect(options).toMatchObject({ redirect: 'error' });
    expect(JSON.parse(options.body)).toEqual({ photo_id: 'photo' });
  });

  it.each([80001, 80002])(
    'reports Meta throttle %s as a confirmed retryable rejection',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ error: { code } }, { status: 400 })),
      );
      await expect(driver.publishInstagram(account, 'container')).rejects.toMatchObject({
        code: 'retryable',
      });
    },
  );

  it.each([
    [400, 190],
    [400, 459],
    [401, null],
  ])('reports a token rejection from HTTP %s and Graph code %s', async (status, code) => {
    const body = code === null ? {} : { error: { code } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status })));
    await expect(driver.publishInstagram(account, 'container')).rejects.toMatchObject({
      code: 'auth_error',
    });
  });

  it('distinguishes a confirmed rejection from an unknown publishing result', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 100 } }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ error: { code: 32 } }, { status: 400 }))
      .mockResolvedValueOnce(
        Response.json({ error: { code: 2, is_transient: true } }, { status: 408 }),
      )
      .mockRejectedValueOnce(new Error('disconnected'));
    vi.stubGlobal('fetch', fetch);

    await expect(driver.publishInstagram(account, 'container')).rejects.toMatchObject({
      code: 'rejected',
    });
    await expect(driver.publishInstagram(account, 'container')).rejects.toMatchObject({
      code: 'retryable',
    });
    await expect(driver.publishInstagram(account, 'container')).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(driver.publishInstagram(account, 'container')).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('reads Facebook counts and reach from the post and its insights', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          reactions: { summary: { total_count: 12 } },
          comments: { summary: { total_count: 3 } },
          shares: { count: 2 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ name: 'post_total_media_view_unique', values: [{ value: 450 }] }],
        }),
      );
    vi.stubGlobal('fetch', fetch);

    expect(
      await driver.postMetrics(account, {
        kind: 'facebook_page',
        externalPostId: '123_456',
        isStory: false,
      }),
    ).toEqual({ reach: 450, reactions: 12, comments: 3, shares: 2, rejectedInsights: null });
  });

  it('reads Instagram likes, comments, reach and shares, and only reach for a story', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ like_count: 25, comments_count: 6 }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { name: 'reach', values: [{ value: 300 }] },
            { name: 'shares', values: [{ value: 4 }] },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [{ name: 'reach', values: [{ value: 80 }] }] }));
    vi.stubGlobal('fetch', fetch);

    const post = { kind: 'instagram' as const, externalPostId: '999', isStory: false };
    expect(await driver.postMetrics(account, post)).toEqual({
      reach: 300,
      reactions: 25,
      comments: 6,
      shares: 4,
      rejectedInsights: null,
    });
    expect(await driver.postMetrics(account, { ...post, isStory: true })).toEqual({
      reach: 80,
      reactions: null,
      comments: null,
      shares: null,
      rejectedInsights: null,
    });
  });

  it('reports a rate limit as retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: { code: 4 } }, { status: 429 })),
    );
    await expect(
      driver.postMetrics(account, { kind: 'instagram', externalPostId: '9', isStory: false }),
    ).rejects.toMatchObject({ code: 'retryable' });
  });

  it('keeps the counts when Meta rejects the insights metric', async () => {
    const rejected = () => Response.json({ error: { code: 100 } }, { status: 400 });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          reactions: { summary: { total_count: 12 } },
          comments: { summary: { total_count: 3 } },
          shares: { count: 2 },
        }),
      )
      .mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce(Response.json({ like_count: 25, comments_count: 6 }))
      .mockResolvedValueOnce(rejected());
    vi.stubGlobal('fetch', fetch);

    expect(
      await driver.postMetrics(account, {
        kind: 'facebook_page',
        externalPostId: '123_456',
        isStory: false,
      }),
    ).toEqual({
      reach: null,
      reactions: 12,
      comments: 3,
      shares: 2,
      rejectedInsights: 'post_total_media_view_unique',
    });
    expect(
      await driver.postMetrics(account, { kind: 'instagram', externalPostId: '9', isStory: false }),
    ).toEqual({
      reach: null,
      reactions: 25,
      comments: 6,
      shares: null,
      rejectedInsights: 'reach,shares',
    });
  });
});
