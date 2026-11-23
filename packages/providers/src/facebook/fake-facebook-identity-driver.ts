import {
  facebookIdentity,
  FacebookIdentityError,
  type FacebookIdentity,
  type FacebookIdentityDriver,
} from './facebook-identity-driver';

const prefix = 'fake-facebook:';

// Local and test use only. The "code" is the profile as JSON, so a test chooses who signs in.
export class FakeFacebookIdentityDriver implements FacebookIdentityDriver {
  constructor(private readonly redirectUri: string) {}

  authorizeUrl(state: string): string {
    const profile = { id: '1000000000001', name: 'Dev Owner', email: 'dev-owner@example.test' };
    const url = new URL(this.redirectUri);
    url.searchParams.set('code', `${prefix}${JSON.stringify(profile)}`);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async identify(code: string): Promise<FacebookIdentity> {
    try {
      if (!code.startsWith(prefix)) throw new Error('Invalid fake identity');
      return facebookIdentity(JSON.parse(code.slice(prefix.length)));
    } catch {
      throw new FacebookIdentityError('FACEBOOK_IDENTITY_INVALID');
    }
  }
}
