import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { GoogleIdentity } from '@dakly/providers/google/google-identity-driver';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { authKey } from './auth-key';
import { authError } from './auth.errors';

export type GoogleGrant = {
  purpose: 'signup' | 'email';
  identity: GoogleIdentity;
  expectedOwnerId?: string;
  expectedEmailVerifiedAt?: string;
};
@Injectable()
export class GoogleTickets {
  constructor(@Inject(ValkeyClient) private readonly client: ValkeyClient) {}
  async issue(grant: GoogleGrant): Promise<string> {
    const ticket = randomBytes(32).toString('base64url');
    await this.client.connection.set(
      authKey('google-ticket', ticket),
      JSON.stringify(grant),
      'EX',
      900,
    );
    return ticket;
  }
  async read(
    ticket: string,
    purpose: GoogleGrant['purpose'],
    consume = false,
  ): Promise<GoogleGrant> {
    const key = authKey('google-ticket', ticket);
    const data = consume
      ? await this.client.connection.getdel(key)
      : await this.client.connection.get(key);
    if (!data) throw authError('AUTH_GOOGLE_TICKET_INVALID');
    const grant = JSON.parse(data) as GoogleGrant;
    if (grant.purpose !== purpose) throw authError('AUTH_GOOGLE_TICKET_INVALID');
    return grant;
  }
}
