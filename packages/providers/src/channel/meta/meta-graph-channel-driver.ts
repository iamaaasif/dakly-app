import { z } from 'zod';

import {
  MetaRequestError,
  type MetaAuthorizationDriver,
  type MetaPage,
  type MetaTokenHealthDriver,
} from '../channel-driver';

const graph = 'https://graph.facebook.com/v27.0/';
const login = 'https://www.facebook.com/v27.0/dialog/oauth';
const requestTimeoutMs = 5000;
const pageManagementTasks = ['MANAGE', 'PROFILE_PLUS_MANAGE', 'PROFILE_PLUS_FULL_CONTROL'];

const accessTokenSchema = z.object({ access_token: z.string().min(1) });
const graphErrorSchema = z.object({ error: z.object({ code: z.number() }) });
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

function responseError(status: number, payload: unknown): MetaRequestError {
  const code = graphErrorSchema.safeParse(payload).data?.error.code;
  const permissionDenied = code === 10 || (code !== undefined && code >= 200 && code <= 299);
  const authError = status === 401 || code === 190 || code === 459 || permissionDenied;
  return new MetaRequestError(authError ? 'auth_error' : 'unavailable');
}

type MetaApp = {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
};

export class MetaGraphChannelDriver implements MetaAuthorizationDriver, MetaTokenHealthDriver {
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
      { subscribed_fields: 'messages,messaging_postbacks,feed' },
      z.object({ success: z.literal(true) }),
      { method: 'POST', signal: AbortSignal.timeout(requestTimeoutMs), accessToken },
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

  private async request<T>(
    path: string,
    query: Record<string, string>,
    schema: z.ZodType<T>,
    options: { signal: AbortSignal; accessToken?: string; method?: 'POST' },
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
        ...(options.accessToken && { headers: { authorization: `Bearer ${options.accessToken}` } }),
      });
      payload = await response.json();
    } catch {
      throw new MetaRequestError('unavailable');
    }
    if (!response.ok) throw responseError(response.status, payload);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new MetaRequestError('invalid_response');
    return parsed.data;
  }
}
