import {
  googleIdentity,
  type GoogleIdentityDriver,
  type GoogleIdentity,
} from './google-identity-driver';

export class FakeGoogleIdentityDriver implements GoogleIdentityDriver {
  async verify(idToken: string): Promise<GoogleIdentity> {
    try {
      if (!idToken.startsWith('fake-google:')) throw new Error('Invalid fake identity');
      return googleIdentity(JSON.parse(idToken.slice('fake-google:'.length)));
    } catch {
      throw new Error('Google identity could not be verified');
    }
  }
}
