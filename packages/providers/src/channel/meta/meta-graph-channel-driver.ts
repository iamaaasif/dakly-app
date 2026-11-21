import { z } from 'zod';

import {
  MetaRequestError,
  type ChannelCredentials,
  type ChannelDriver,
  type CommentDriver,
  type MediaDownload,
  type MetaAuthorizationDriver,
  type MetaPage,
  type MetaTokenHealthDriver,
  type OutboundMessage,
} from '../channel-driver';

const graph = 'https://graph.facebook.com/v27.0/';
const login = 'https://www.facebook.com/v27.0/dialog/oauth';
const requestTimeoutMs = 5000;
const mediaTimeoutMs = 20_000;
// The webhook is signed, but the token only goes to Meta's own media hosts.
const mediaHostSuffixes = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com'];
const pageManagementTasks = ['MANAGE', 'PROFILE_PLUS_MANAGE', 'PROFILE_PLUS_FULL_CONTROL'];

const accessTokenSchema = z.object({ access_token: z.string().min(1) });
const graphErrorSchema = z.object({
  error: z.object({ code: z.number(), error_subcode: z.number().optional() }),
});
const accountsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      tasks: z.array(z.string()).optional(),
      access_token: z.string().min(1).optional(),
      instagram_business_account: z
        .object({ id: z.string().min(1), username: z.string().min(1) })
        .nullish(),
    }),
  ),
  paging: z
    .object({
      next: z.string().optional(),
      cursors: z.object({ after: z.string().min(1).optional() }).optional(),
    })
    .optional(),
});

function selectablePage(
  page: z.infer<typeof accountsSchema>['data'][number],
): MetaPage | undefined {
  if (!page.access_token || !page.tasks?.some((task) => pageManagementTasks.includes(task)))
    return undefined;
  const instagram = page.instagram_business_account;
  return {
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    instagram: instagram ? { id: instagram.id, name: instagram.username } : null,
  };
}

function responseError(status: number, payload: unknown, sending: boolean): MetaRequestError {
  const error = graphErrorSchema.safeParse(payload).data?.error;
  const code = error?.code ?? 0;
  if (status === 401 || [190, 459].includes(code)) return new MetaRequestError('auth_error');
  if (sending) return sendResponseError(code, error?.error_subcode);
  return new MetaRequestError(permissionDenied(code) ? 'auth_error' : 'unavailable');
}

function sendResponseError(code: number, subcode?: number): MetaRequestError {
  if (
    (code === 10 && subcode === 2534077) ||
    (code === 200 && subcode === 2534041) ||
    (code === 100 && subcode === 2534013)
  )
    return new MetaRequestError('auth_error');
  if (permissionDenied(code) || [100, 551, 10903, 10904].includes(code))
    return new MetaRequestError('rejected');
  return new MetaRequestError('unavailable');
}

function permissionDenied(code: number): boolean {
  return code === 10 || (code >= 200 && code <= 299);
}

function messageContent(message: OutboundMessage) {
  if (message.channel === 'instagram') return { text: message.text };
  const metadata = message.operationKey;
  if (!message.buttons?.length) return { text: message.text, metadata };
  const buttons = message.buttons.map(({ title, payload }) => ({
    type: 'postback',
    title,
    payload,
  }));
  return {
    attachment: {
      type: 'template',
      payload: { template_type: 'button', text: message.text, buttons },
    },
    metadata,
  };
}

function isMetaMediaUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return protocol === 'https:' && mediaHostSuffixes.some((suffix) => hostname.endsWith(suffix));
}

// Meta's signed media links carry their expiry as hex Unix seconds in the `oe` parameter.
function linkExpired(url: string): boolean {
  const expiry = Number.parseInt(new URL(url).searchParams.get('oe') ?? '', 16);
  return Number.isFinite(expiry) && expiry * 1000 < Date.now();
}

// Returns a final answer for a failed fetch, throws for an uncertain one, or nothing on success.
function failedMediaResult(response: Response, url: string): MediaDownload | undefined {
  const { status } = response;
  // The token must never follow a redirect, so a redirect is a final answer.
  if (status >= 300 && status < 400) throw new MetaRequestError('rejected');
  // A CDN answer says nothing certain about the Page token, so it never marks it rejected.
  if (status === 401) throw new MetaRequestError('rejected');
  if ([400, 404, 410].includes(status)) return { kind: 'expired' };
  // A 403 is only an expired link when the link's own expiry has passed; otherwise it may pass
  // on a retry, so it counts as a fetch failure.
  if (status === 403 && linkExpired(url)) return { kind: 'expired' };
  if (!response.ok) throw new MetaRequestError('unavailable');
  return undefined;
}

function mediaType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
}

// Content-Length can be missing or wrong, so the body is counted as it arrives.
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body ?? []) {
      total += chunk.byteLength;
      if (total > maxBytes) return null;
      chunks.push(chunk);
    }
  } catch {
    throw new MetaRequestError('unavailable');
  }
  return Buffer.concat(chunks);
}

type MetaApp = {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
};

export class MetaGraphChannelDriver
  implements
    MetaAuthorizationDriver,
    MetaTokenHealthDriver,
    Pick<ChannelDriver, 'send' | 'downloadMedia'>,
    Omit<CommentDriver, 'parseComments'>
{
  constructor(private readonly app: MetaApp) {}

  authorizationUrl(state: string): string {
    const url = new URL(login);
    url.search = new URLSearchParams({
      client_id: this.app.appId,
      config_id: this.app.loginConfigId,
      redirect_uri: this.app.redirectUri,
      response_type: 'code',
      state,
    }).toString();
    return url.href;
  }

  async exchangeAuthorizationCode(code: string): Promise<string> {
    const app = { client_id: this.app.appId, client_secret: this.app.appSecret };
    const options = { signal: AbortSignal.timeout(requestTimeoutMs) };
    const short = await this.request(
      'oauth/access_token',
      { ...app, code, redirect_uri: this.app.redirectUri },
      accessTokenSchema,
      options,
    );
    const long = await this.request(
      'oauth/access_token',
      { ...app, grant_type: 'fb_exchange_token', fb_exchange_token: short.access_token },
      accessTokenSchema,
      options,
    );
    return long.access_token;
  }

  async listAccounts(userToken: string): Promise<MetaPage[]> {
    const pages: MetaPage[] = [];
    const cursors = new Set<string>();
    const options = { accessToken: userToken, signal: AbortSignal.timeout(requestTimeoutMs) };
    const params = { fields: 'id,name,tasks,access_token,instagram_business_account{id,username}' };
    let after: string | undefined;
    for (;;) {
      const response = await this.request(
        'me/accounts',
        { ...params, ...(after && { after }) },
        accountsSchema,
        options,
      );
      for (const page of response.data) {
        const account = selectablePage(page);
        if (account) pages.push(account);
      }
      if (!response.paging?.next) return pages;
      // Only reuse the cursor. A provider-supplied URL must never receive the user token.
      after = response.paging.cursors?.after;
      if (!after || cursors.has(after)) throw new MetaRequestError('invalid_response');
      cursors.add(after);
    }
  }

  async subscribePage(pageId: string, accessToken: string): Promise<void> {
    await this.request(
      `${encodeURIComponent(pageId)}/subscribed_apps`,
      {
        subscribed_fields:
          'messages,messaging_postbacks,feed,message_deliveries,message_reads,message_echoes',
      },
      z.object({ success: z.literal(true) }),
      { method: 'POST', signal: AbortSignal.timeout(requestTimeoutMs), accessToken },
    );
  }

  async unsubscribePage(pageId: string, accessToken: string): Promise<void> {
    await this.request(
      `${encodeURIComponent(pageId)}/subscribed_apps`,
      {},
      z.object({ success: z.literal(true) }),
      { method: 'DELETE', signal: AbortSignal.timeout(requestTimeoutMs), accessToken },
    );
  }

  async isTokenValid(accessToken: string): Promise<boolean> {
    const result = await this.request(
      'debug_token',
      { input_token: accessToken },
      z.object({ data: z.object({ is_valid: z.boolean() }) }),
      {
        accessToken: `${this.app.appId}|${this.app.appSecret}`,
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    return result.data.is_valid;
  }

  async send(credentials: ChannelCredentials, message: OutboundMessage) {
    // Messenger cannot put an image and a text with buttons in one message, so the image goes
    // first. Only the text message carries the operation key, so one send echoes one key.
    // A refused image does not stop the text, but an uncertain one does: it may have gone out.
    let imageRejected = false;
    if (message.imageUrl) {
      try {
        await this.post(credentials, message, {
          attachment: { type: 'image', payload: { url: message.imageUrl } },
        });
      } catch (error) {
        if (!(error instanceof MetaRequestError) || error.code !== 'rejected') throw error;
        imageRejected = true;
      }
    }
    const sent = await this.post(credentials, message, messageContent(message));
    return imageRejected ? { ...sent, imageRejected: true as const } : sent;
  }

  private async post(
    { accountExternalId, accessToken }: ChannelCredentials,
    message: OutboundMessage,
    content: Record<string, unknown>,
  ) {
    const messenger = message.channel === 'messenger';
    const delivery = message.humanAgent
      ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
      : messenger && { messaging_type: 'RESPONSE' };
    const body = JSON.stringify({
      recipient: { id: message.externalConversationId },
      message: content,
      ...delivery,
    });
    const endpoint = messenger ? encodeURIComponent(accountExternalId) : 'me';
    const response = await this.request(
      `${endpoint}/messages`,
      {},
      z.object({ message_id: z.string().min(1) }),
      { method: 'POST', accessToken, signal: AbortSignal.timeout(requestTimeoutMs), body },
    );
    return { externalMessageId: response.message_id };
  }

  async replyToComment(
    { accessToken }: ChannelCredentials,
    comment: Parameters<CommentDriver['replyToComment']>[1],
  ) {
    const edge = comment.channel === 'messenger' ? 'comments' : 'replies';
    const response = await this.request(
      `${encodeURIComponent(comment.externalCommentId)}/${edge}`,
      {},
      z.object({ id: z.string().min(1) }),
      {
        method: 'POST',
        accessToken,
        signal: AbortSignal.timeout(requestTimeoutMs),
        body: JSON.stringify({ message: comment.text }),
      },
    );
    return { externalReplyId: response.id };
  }

  async sendPrivateReply(
    { accessToken, accountExternalId }: ChannelCredentials,
    comment: Parameters<CommentDriver['sendPrivateReply']>[1],
  ) {
    const endpoint = comment.channel === 'messenger' ? encodeURIComponent(accountExternalId) : 'me';
    const response = await this.request(
      `${endpoint}/messages`,
      {},
      z.object({ message_id: z.string().min(1), recipient_id: z.string().min(1) }),
      {
        method: 'POST',
        accessToken,
        signal: AbortSignal.timeout(requestTimeoutMs),
        body: JSON.stringify({
          recipient: { comment_id: comment.externalCommentId },
          message: { text: comment.text },
        }),
      },
    );
    return { externalMessageId: response.message_id, recipientExternalId: response.recipient_id };
  }

  async setCommentHidden(
    { accessToken }: ChannelCredentials,
    comment: Parameters<CommentDriver['setCommentHidden']>[1],
  ) {
    const flag = comment.channel === 'messenger' ? 'is_hidden' : 'hide';
    await this.request(
      encodeURIComponent(comment.externalCommentId),
      {},
      z.object({ success: z.literal(true) }),
      {
        method: 'POST',
        accessToken,
        signal: AbortSignal.timeout(requestTimeoutMs),
        body: JSON.stringify({ [flag]: comment.hidden }),
      },
    );
  }

  async downloadMedia(accessToken: string, url: string, maxBytes: number): Promise<MediaDownload> {
    if (!isMetaMediaUrl(url)) throw new MetaRequestError('rejected');
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(mediaTimeoutMs),
        redirect: 'manual',
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new MetaRequestError('unavailable');
    }
    const failure = failedMediaResult(response, url);
    if (failure) return failure;
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxBytes) return { kind: 'too_large' };
    const bytes = await readCapped(response, maxBytes);
    if (!bytes) return { kind: 'too_large' };
    return { kind: 'downloaded', bytes, contentType: mediaType(response) };
  }

  private async request<T>(
    path: string,
    query: Record<string, string>,
    schema: z.ZodType<T>,
    options: {
      signal: AbortSignal;
      accessToken?: string;
      method?: 'POST' | 'DELETE';
      body?: string;
    },
  ): Promise<T> {
    const url = new URL(path, graph);
    url.search = new URLSearchParams(query).toString();
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(url, {
        signal: options.signal,
        method: options.method,
        redirect: 'error',
        body: options.body,
        headers: {
          ...(options.accessToken && { authorization: `Bearer ${options.accessToken}` }),
          ...(options.body && { 'content-type': 'application/json' }),
        },
      });
      payload = await response.json();
    } catch {
      throw new MetaRequestError('unavailable');
    }
    if (!response.ok) throw responseError(response.status, payload, options.body !== undefined);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new MetaRequestError('invalid_response');
    return parsed.data;
  }
}
