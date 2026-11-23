import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetaGraphChannelDriver } from './meta-graph-channel-driver';

const driver = new MetaGraphChannelDriver({
  appId: '123456',
  appSecret: 'test-app-secret',
  loginConfigId: '789012',
  redirectUri: 'https://shop.example.test/integrations/meta',
});

const pageCredentials = { accountExternalId: '123', accessToken: 'test-page-credential' };
const messengerReply = {
  channel: 'messenger',
  externalConversationId: '999',
  text: 'জি, পণ্যটি আছে।',
  operationKey: 'message-operation-1',
} as const;

describe('MetaGraphChannelDriver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a Messenger reply with an operation reference for the echo', async () => {
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      const request = new Request(url, init);
      expect(url.hostname).toBe('graph.facebook.com');
      expect(url.pathname).toMatch(/\/123\/messages$/);
      expect(url.search).toBe('');
      expect(request.method).toBe('POST');
      expect(request.headers.get('authorization')).toBe('Bearer test-page-credential');
      expect(await request.json()).toEqual({
        recipient: { id: messengerReply.externalConversationId },
        message: { text: messengerReply.text, metadata: messengerReply.operationKey },
        messaging_type: 'RESPONSE',
      });
      return Response.json({ message_id: 'm_accepted', recipient_id: '999' });
    });
    await expect(driver.send(pageCredentials, messengerReply)).resolves.toEqual({
      externalMessageId: 'm_accepted',
    });
  });

  it('sends text with up to three postback buttons as a Messenger button template', async () => {
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      expect(await new Request(url, init).json()).toEqual({
        recipient: { id: '999' },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: messengerReply.text,
              buttons: [
                { type: 'postback', title: 'হ্যাঁ', payload: 'confirm:1' },
                { type: 'postback', title: 'না', payload: 'cancel:1' },
              ],
            },
          },
          metadata: messengerReply.operationKey,
        },
        messaging_type: 'RESPONSE',
      });
      return Response.json({ message_id: 'm_buttons' });
    });
    await expect(
      driver.send(pageCredentials, {
        ...messengerReply,
        buttons: [
          { title: 'হ্যাঁ', payload: 'confirm:1' },
          { title: 'না', payload: 'cancel:1' },
        ],
      }),
    ).resolves.toEqual({ externalMessageId: 'm_buttons' });
  });

  it('sends the image first and returns the id of the text message that carries the key', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      bodies.push(await new Request(url, init).json());
      return Response.json({ message_id: `m_${bodies.length}` });
    });
    await expect(
      driver.send(pageCredentials, {
        ...messengerReply,
        imageUrl: 'https://cdn.example.test/offer.jpg',
      }),
    ).resolves.toEqual({ externalMessageId: 'm_2' });
    expect(bodies).toEqual([
      {
        recipient: { id: '999' },
        message: {
          attachment: { type: 'image', payload: { url: 'https://cdn.example.test/offer.jpg' } },
        },
        messaging_type: 'RESPONSE',
      },
      {
        recipient: { id: '999' },
        message: { text: messengerReply.text, metadata: messengerReply.operationKey },
        messaging_type: 'RESPONSE',
      },
    ]);
  });

  it('sends the image before the text on Instagram too', async () => {
    const bodies: { message: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      bodies.push(await new Request(url, init).json());
      return Response.json({ message_id: `mid.${bodies.length}` });
    });
    await expect(
      driver.send(pageCredentials, {
        ...messengerReply,
        channel: 'instagram',
        imageUrl: 'https://cdn.example.test/red.jpg',
      }),
    ).resolves.toEqual({ externalMessageId: 'mid.2' });
    expect(bodies[0]!.message).toEqual({
      attachment: { type: 'image', payload: { url: 'https://cdn.example.test/red.jpg' } },
    });
    expect(bodies[1]!.message).toMatchObject({ text: messengerReply.text });
  });

  it('still sends the text when Meta refuses the image and reports it', async () => {
    const bodies: { message: { text?: string } }[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      const body = await new Request(url, init).json();
      bodies.push(body);
      return bodies.length === 1
        ? Response.json({ error: { code: 100 } }, { status: 400 })
        : Response.json({ message_id: 'm_text' });
    });
    await expect(
      driver.send(pageCredentials, {
        ...messengerReply,
        imageUrl: 'https://cdn.example.test/a.jpg',
      }),
    ).resolves.toEqual({ externalMessageId: 'm_text', imageRejected: true });
    expect(bodies.map((body) => body.message.text)).toEqual([undefined, messengerReply.text]);
  });

  it('does not send the text when the image outcome is uncertain', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('Request timed out', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      driver.send(pageCredentials, {
        ...messengerReply,
        imageUrl: 'https://cdn.example.test/a.jpg',
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the difference between an invalid credential and an uncertain send', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 190, message: 'private details' } }, { status: 400 }),
    );
    await expect(driver.send(pageCredentials, messengerReply)).rejects.toMatchObject({
      code: 'auth_error',
      message: 'Meta request failed',
    });
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('Request timed out', 'TimeoutError');
    });
    await expect(driver.send(pageCredentials, messengerReply)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it.each([100, 551, 10903, 10904])(
    'reports Graph rejection %s as a definite failure',
    async (code) => {
      vi.stubGlobal('fetch', async () =>
        Response.json({ error: { code, message: 'Private recipient details' } }, { status: 400 }),
      );
      await expect(driver.send(pageCredentials, messengerReply)).rejects.toMatchObject({
        code: 'rejected',
        message: 'Meta request failed',
      });
    },
  );

  it('uses the linked Page token for a reply to an Instagram-scoped recipient', async () => {
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      expect(url.pathname).toMatch(/\/me\/messages$/);
      const request = new Request(url, init);
      expect(request.headers.get('authorization')).toBe('Bearer test-page-credential');
      expect(await request.json()).toMatchObject({
        recipient: { id: messengerReply.externalConversationId },
        message: { text: messengerReply.text },
      });
      return Response.json({ message_id: 'mid.instagram' });
    });
    await expect(
      driver.send(
        { ...pageCredentials, accountExternalId: 'instagram-business-account' },
        { ...messengerReply, channel: 'instagram' },
      ),
    ).resolves.toEqual({ externalMessageId: 'mid.instagram' });
  });

  it('treats a message-window error as a send rejection without revoking the connection', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 10, error_subcode: 2018278 } }, { status: 400 }),
    );
    await expect(driver.send(pageCredentials, messengerReply)).rejects.toMatchObject({
      code: 'rejected',
    });
  });

  it.each([
    [10, 2534077],
    [200, 2534041],
    [100, 2534013],
  ])('requires reconnect for Graph link or access error %s/%s', async (code, error_subcode) => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code, error_subcode } }, { status: 400 }),
    );
    await expect(driver.send(pageCredentials, messengerReply)).rejects.toMatchObject({
      code: 'auth_error',
    });
  });

  it('labels a staff reply requiring the human-agent window', async () => {
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      expect(await new Request(url, init).json()).toMatchObject({
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
      });
      return Response.json({ message_id: 'm_staff_reply' });
    });
    await expect(
      driver.send(pageCredentials, { ...messengerReply, humanAgent: true }),
    ).resolves.toEqual({ externalMessageId: 'm_staff_reply' });
  });

  it("replies to a Facebook comment and an Instagram comment on each one's own edge", async () => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      paths.push(url.pathname);
      expect(await new Request(url, init).json()).toEqual({ message: 'ইনবক্সে দাম জানিয়েছি' });
      return Response.json({ id: 'reply-1' });
    });
    const text = 'ইনবক্সে দাম জানিয়েছি';
    await driver.replyToComment(pageCredentials, {
      channel: 'messenger',
      externalCommentId: 'c1',
      text,
    });
    await driver.replyToComment(pageCredentials, {
      channel: 'instagram',
      externalCommentId: 'c2',
      text,
    });
    expect(paths).toEqual(['/v27.0/c1/comments', '/v27.0/c2/replies']);
  });

  it('sends a private reply addressed to the comment and returns the opened chat', async () => {
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      expect(url.pathname).toMatch(/\/123\/messages$/);
      expect(await new Request(url, init).json()).toEqual({
        recipient: { comment_id: 'c1' },
        message: { text: 'Price 850 taka' },
      });
      return Response.json({ message_id: 'm_private', recipient_id: '999' });
    });
    await expect(
      driver.sendPrivateReply(pageCredentials, {
        channel: 'messenger',
        externalCommentId: 'c1',
        text: 'Price 850 taka',
      }),
    ).resolves.toEqual({ externalMessageId: 'm_private', recipientExternalId: '999' });
  });

  it('hides a comment with the flag each platform names', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      bodies.push(await new Request(url, init).json());
      return Response.json({ success: true });
    });
    await driver.setCommentHidden(pageCredentials, {
      channel: 'messenger',
      externalCommentId: 'c1',
      hidden: true,
    });
    await driver.setCommentHidden(pageCredentials, {
      channel: 'instagram',
      externalCommentId: 'c2',
      hidden: false,
    });
    expect(bodies).toEqual([{ is_hidden: true }, { hide: false }]);
  });

  it('opens Facebook Login for Business with a server-selected redirect and state', () => {
    const url = new URL(driver.authorizationUrl('login-state'));
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '123456',
      config_id: '789012',
      redirect_uri: 'https://shop.example.test/integrations/meta',
      response_type: 'code',
      state: 'login-state',
    });
  });

  it('exchanges the authorization code and uses the long-lived user credential to list linked accounts', async () => {
    const requests: { url: URL; authorization: string | null }[] = [];
    const responses = [
      { access_token: 'test-short-user-credential' },
      { access_token: 'test-long-user-credential' },
      {
        data: [
          {
            id: '123',
            name: 'রিনার দোকান',
            access_token: 'test-page-credential',
            tasks: ['MANAGE', 'MESSAGING'],
            instagram_business_account: { id: '789', username: 'rinas_shop' },
          },
        ],
        paging: { next: 'https://untrusted.example.test/path', cursors: { after: 'page-cursor' } },
      },
      {
        data: [
          {
            id: '456',
            name: 'Karim Shop',
            access_token: 'other-test-page-credential',
            tasks: ['MANAGE'],
          },
        ],
      },
    ];
    vi.stubGlobal('fetch', async (endpoint: URL, init: RequestInit) => {
      requests.push({
        url: new URL(endpoint),
        authorization: new Headers(init.headers).get('authorization'),
      });
      return Response.json(responses.shift());
    });

    const credential = await driver.exchangeAuthorizationCode('authorization-code');
    expect(await driver.listAccounts(credential)).toEqual([
      {
        id: '123',
        name: 'রিনার দোকান',
        accessToken: 'test-page-credential',
        instagram: { id: '789', name: 'rinas_shop' },
      },
      {
        id: '456',
        name: 'Karim Shop',
        accessToken: 'other-test-page-credential',
        instagram: null,
      },
    ]);
    expect(requests.map(({ url }) => url.hostname)).toEqual(Array(4).fill('graph.facebook.com'));
    expect(requests[0]?.url.searchParams.get('code')).toBe('authorization-code');
    expect(requests[1]?.url.searchParams.get('fb_exchange_token')).toBe(
      'test-short-user-credential',
    );
    expect(requests[2]?.authorization).toBe('Bearer test-long-user-credential');
    expect(requests[3]?.url.searchParams.get('after')).toBe('page-cursor');
  });

  it('shares one deadline across pages with distinct cursors', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal);
    vi.stubGlobal('fetch', async (endpoint: URL, init: RequestInit) => {
      const after = endpoint.searchParams.get('after');
      if (init.signal?.aborted) throw new DOMException('Request timed out', 'TimeoutError');
      if (after === 'second') return Response.json({ data: [] });
      if (after === 'first') deadline.abort();
      return Response.json({
        data: [],
        paging: {
          next: 'https://graph.facebook.com/next',
          cursors: { after: after ? 'second' : 'first' },
        },
      });
    });

    await expect(driver.listAccounts('test-user-credential')).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('subscribes the selected Page to the required fields with its Page token', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (endpoint: URL, init: RequestInit) => {
      requests.push(new Request(endpoint, init));
      return Response.json({ success: true });
    });

    await driver.subscribePage('123', 'test-page-credential');
    expect(requests).toHaveLength(1);
    const [request] = requests;
    const url = new URL(request!.url);
    expect(url.hostname).toBe('graph.facebook.com');
    expect(url.pathname).toMatch(/\/123\/subscribed_apps$/);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      subscribed_fields:
        'messages,messaging_postbacks,feed,message_deliveries,message_reads,message_echoes',
    });
    expect(request!.method).toBe('POST');
    expect(request!.headers.get('authorization')).toBe('Bearer test-page-credential');
  });

  it('unsubscribes the app from a Page with the Page token', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      requests.push(new Request(url, init));
      return Response.json({ success: true });
    });

    await driver.unsubscribePage('123', 'test-page-credential');
    const [request] = requests;
    expect(new URL(request!.url).pathname).toMatch(/\/123\/subscribed_apps$/);
    expect(request!.method).toBe('DELETE');
    expect(request!.headers.get('authorization')).toBe('Bearer test-page-credential');
  });

  it('distinguishes an invalid Page token from an app authentication failure', async () => {
    const responses = [
      Response.json({ data: { is_valid: false } }),
      Response.json(
        { error: { code: 190, message: 'private app credential details' } },
        { status: 401 },
      ),
    ];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      expect(url.hostname).toBe('graph.facebook.com');
      expect(url.pathname).toMatch(/\/debug_token$/);
      expect(url.searchParams.get('input_token')).toBe('test-page-credential');
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer 123456|test-app-secret');
      return responses.shift()!;
    });
    await expect(driver.isTokenValid('test-page-credential')).resolves.toBe(false);
    await expect(driver.isTokenValid('test-page-credential')).rejects.toMatchObject({
      code: 'auth_error',
    });
  });

  it('treats a Meta Page permission denial as an authorization error', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: { code: 200, message: 'private permission details' } },
        { status: 403 },
      ),
    );
    await expect(driver.subscribePage('123', 'test-page-credential')).rejects.toMatchObject({
      code: 'auth_error',
      message: 'Meta request failed',
    });
  });

  it('returns a typed failure without the vendor error text', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 190, message: 'private token details' } }, { status: 400 }),
    );
    await expect(driver.exchangeAuthorizationCode('old-code')).rejects.toMatchObject({
      code: 'auth_error',
      message: 'Meta request failed',
    });
  });

  describe('fetchProfile', () => {
    it('joins the first and last name Meta gives for a Messenger sender', async () => {
      vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
        expect(url.pathname).toMatch(/\/999$/);
        expect(url.searchParams.get('fields')).toBe('first_name,last_name');
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-page-credential');
        return Response.json({ first_name: 'Karim', last_name: 'Uddin', id: '999' });
      });
      await expect(
        driver.fetchProfile('test-page-credential', { channel: 'messenger', externalId: '999' }),
      ).resolves.toEqual({ name: 'Karim Uddin' });
    });

    it('uses the name or the username for an Instagram sender', async () => {
      vi.stubGlobal('fetch', async () => Response.json({ username: 'karim_shop', id: '1' }));
      await expect(
        driver.fetchProfile('t', { channel: 'instagram', externalId: '1' }),
      ).resolves.toEqual({ name: 'karim_shop' });
    });

    it('returns nothing when Meta refuses for a missing permission', async () => {
      vi.stubGlobal('fetch', async () => Response.json({ error: { code: 230 } }, { status: 400 }));
      await expect(
        driver.fetchProfile('t', { channel: 'messenger', externalId: '999' }),
      ).resolves.toBeNull();
    });

    it('throws on an outage so the lookup is retried', async () => {
      vi.stubGlobal('fetch', async () => Response.json({ error: { code: 2 } }, { status: 500 }));
      await expect(
        driver.fetchProfile('t', { channel: 'messenger', externalId: '999' }),
      ).rejects.toMatchObject({ code: 'unavailable' });
    });
  });

  describe('downloadMedia', () => {
    const url = 'https://scontent.xx.fbcdn.net/photo.jpg';

    it('downloads media from a Meta host with the Page credential', async () => {
      vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-page-credential');
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/jpeg; charset=binary' },
        });
      });
      await expect(driver.downloadMedia('test-page-credential', url, 10)).resolves.toEqual({
        kind: 'downloaded',
        bytes: Buffer.from([1, 2, 3]),
        contentType: 'image/jpeg',
      });
    });

    it('never sends the credential to a host Meta does not own', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      for (const other of ['https://evil.example.test/photo', 'http://scontent.xx.fbcdn.net/p'])
        await expect(driver.downloadMedia('test-page-credential', other, 10)).rejects.toMatchObject(
          {
            code: 'rejected',
          },
        );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports an expired link, an oversize body and an outage as different results', async () => {
      vi.stubGlobal('fetch', async () => new Response('gone', { status: 404 }));
      await expect(driver.downloadMedia('t', url, 10)).resolves.toEqual({ kind: 'expired' });
      vi.stubGlobal('fetch', async () => new Response('denied', { status: 403 }));
      await expect(driver.downloadMedia('t', `${url}?oe=1`, 10)).resolves.toEqual({
        kind: 'expired',
      });
      await expect(driver.downloadMedia('t', `${url}?oe=ffffffffff`, 10)).rejects.toMatchObject({
        code: 'unavailable',
      });
      vi.stubGlobal('fetch', async () => new Response(new Uint8Array(11)));
      await expect(driver.downloadMedia('t', url, 10)).resolves.toEqual({ kind: 'too_large' });
      vi.stubGlobal('fetch', async () => new Response('', { status: 302 }));
      await expect(driver.downloadMedia('t', url, 10)).rejects.toMatchObject({ code: 'rejected' });
      vi.stubGlobal('fetch', async () => new Response('', { status: 401 }));
      await expect(driver.downloadMedia('t', url, 10)).rejects.toMatchObject({ code: 'rejected' });
      vi.stubGlobal('fetch', async () => new Response('busy', { status: 503 }));
      await expect(driver.downloadMedia('t', url, 10)).rejects.toMatchObject({
        code: 'unavailable',
      });
    });
  });
  const card = {
    elements: [
      {
        title: 'কটন পাঞ্জাবি',
        subtitle: '৳1,250',
        imageUrl: 'https://files.example.test/a.jpg',
        buttons: [
          { type: 'postback', title: 'Order now', payload: 'card:order:p1' },
          { type: 'link', title: 'Order link', url: 'https://shop.example.test/o/p1' },
        ],
      },
    ],
  } as const;

  it('sends a card as a generic template with its buttons', async () => {
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      expect(await new Request(url, init).json()).toEqual({
        recipient: { id: '999' },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [
                {
                  title: 'কটন পাঞ্জাবি',
                  subtitle: '৳1,250',
                  image_url: 'https://files.example.test/a.jpg',
                  buttons: [
                    { type: 'postback', title: 'Order now', payload: 'card:order:p1' },
                    { type: 'web_url', title: 'Order link', url: 'https://shop.example.test/o/p1' },
                  ],
                },
              ],
            },
          },
          metadata: messengerReply.operationKey,
        },
        messaging_type: 'RESPONSE',
      });
      return Response.json({ message_id: 'm_card', recipient_id: '999' });
    });
    await expect(driver.send(pageCredentials, { ...messengerReply, card })).resolves.toEqual({
      externalMessageId: 'm_card',
    });
  });

  it('sends the plain text when Meta refuses the card', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      const body = await new Request(url, init).json();
      bodies.push(body);
      if (bodies.length === 1)
        return Response.json(
          { error: { code: 100, message: 'Invalid parameter' } },
          { status: 400 },
        );
      return Response.json({ message_id: 'm_text', recipient_id: '999' });
    });
    await expect(driver.send(pageCredentials, { ...messengerReply, card })).resolves.toEqual({
      externalMessageId: 'm_text',
    });
    expect(bodies[1]).toMatchObject({ message: { text: messengerReply.text } });
  });
});
