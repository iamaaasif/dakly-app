import { z } from 'zod';

import type { MetaAuthorizationDriver, MetaPage } from '../channel-driver';

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

type MetaApp = {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  redirectUri: string;
};

export class MetaRequestError extends Error {
  constructor(readonly code: 'auth_error' | 'unavailable' | 'invalid_response') {
    super('Meta request failed');
    this.name = 'MetaRequestError';
  }
}

export class MetaGraphChannelDriver implements MetaAuthorizationDriver {
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
    const short = await this.get(
      'oauth/access_token',
      { ...app, code, redirect_uri: this.app.redirectUri },
      accessTokenSchema,
      options,
    );
    const long = await this.get(
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
    const options = { userToken, signal: AbortSignal.timeout(requestTimeoutMs) };
    const params = { fields: 'id,name,tasks,access_token,instagram_business_account{id,username}' };
    let after: string | undefined;
    for (;;) {
      const response = await this.get(
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

  private async get<T>(
    path: string,
    query: Record<string, string>,
    schema: z.ZodType<T>,
    options: { signal: AbortSignal; userToken?: string },
  ): Promise<T> {
    const url = new URL(path, graph);
    url.search = new URLSearchParams(query).toString();
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(url, {
        signal: options.signal,
        redirect: 'error',
        ...(options.userToken && { headers: { authorization: `Bearer ${options.userToken}` } }),
      });
      payload = await response.json();
    } catch {
      throw new MetaRequestError('unavailable');
    }
    if (!response.ok) {
      const code = graphErrorSchema.safeParse(payload).data?.error.code;
      throw new MetaRequestError(
        response.status === 401 || code === 190 || code === 459 ? 'auth_error' : 'unavailable',
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new MetaRequestError('invalid_response');
    return parsed.data;
  }
}
