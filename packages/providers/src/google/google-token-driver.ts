import { OAuth2Client } from 'google-auth-library';
import {
  googleIdentity,
  type GoogleIdentityDriver,
  type GoogleIdentity,
} from './google-identity-driver';

export class GoogleTokenDriver implements GoogleIdentityDriver {
  private readonly client = new OAuth2Client({ transporterOptions: { timeout: 5000 } });
  constructor(private readonly clientId: string) {}
  async verify(idToken: string): Promise<GoogleIdentity> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound the whole verification, including the client's certificate-fetch retries.
      const ticket = await Promise.race([
        this.client.verifyIdToken({ idToken, audience: this.clientId }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 10000);
        }),
      ]);
      return googleIdentity(ticket.getPayload() ?? {});
    } catch {
      // Library errors may include token payloads; never let them cross the driver boundary.
      throw new Error('Google identity could not be verified');
    } finally {
      clearTimeout(timer);
    }
  }
}
