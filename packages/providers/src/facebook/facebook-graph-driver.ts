import { createHmac } from 'node:crypto';

import {
  facebookIdentity,
  FacebookIdentityError,
  type FacebookIdentity,
  type FacebookIdentityDriver,
} from './facebook-identity-driver';

const graph = 'https://graph.facebook.com/v21.0';
const timeoutMs = 8000;

export type FacebookGraphConfig = { appId: string; appSecret: string; redirectUri: string };

export class FacebookGraphDriver implements FacebookIdentityDriver {
  constructor(
    private readonly config: FacebookGraphConfig,
    private readonly fetchJson: typeof fetch = fetch,
  ) {}

  authorizeUrl(state: string): string {
    const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'public_profile,email');
    url.searchParams.set('response_type', 'code');
    return url.toString();
  }

  async identify(code: string): Promise<FacebookIdentity> {
    const token = await this.get(`${graph}/oauth/access_token`, {
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.redirectUri,
      code,
    });
    if (typeof token.access_token !== 'string')
      throw new FacebookIdentityError('FACEBOOK_IDENTITY_INVALID');
    const profile = await this.get(`${graph}/me`, {
      fields: 'id,name,email',
      access_token: token.access_token,
      appsecret_proof: createHmac('sha256', this.config.appSecret)
        .update(token.access_token)
        .digest('hex'),
    });
    return facebookIdentity(profile);
  }

  private async get(url: string, query: Record<string, string>): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchJson(`${url}?${new URLSearchParams(query)}`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new FacebookIdentityError('FACEBOOK_IDENTITY_UNAVAILABLE');
    }
    // A used or expired code is a 400; anything else is Facebook being down.
    if (response.status >= 400 && response.status < 500)
      throw new FacebookIdentityError('FACEBOOK_IDENTITY_INVALID');
    if (!response.ok) throw new FacebookIdentityError('FACEBOOK_IDENTITY_UNAVAILABLE');
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new FacebookIdentityError('FACEBOOK_IDENTITY_UNAVAILABLE');
    }
  }
}
