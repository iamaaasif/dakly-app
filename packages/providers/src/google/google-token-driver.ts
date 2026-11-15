import { OAuth2Client } from 'google-auth-library';
import {
  googleIdentity,
  GoogleIdentityError,
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
      return await Promise.race([
        this.verifyIdentity(idToken),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new GoogleIdentityError('GOOGLE_IDENTITY_UNAVAILABLE')),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async verifyIdentity(idToken: string): Promise<GoogleIdentity> {
    const { certs } = await this.certificates();
    try {
      // These are the same verification arguments used by OAuth2Client.verifyIdToken.
      const ticket = await this.client.verifySignedJwtWithCertsAsync(
        idToken,
        certs,
        this.clientId,
        this.client.issuers,
      );
      return googleIdentity(ticket.getPayload() ?? {});
    } catch {
      // Neither JWT payloads nor library error text may cross this boundary.
      throw new GoogleIdentityError('GOOGLE_IDENTITY_INVALID');
    }
  }

  private async certificates() {
    try {
      return await this.client.getFederatedSignonCertsAsync();
    } catch {
      throw new GoogleIdentityError('GOOGLE_IDENTITY_UNAVAILABLE');
    }
  }
}
