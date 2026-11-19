import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  MetaAuthorizationAccounts,
  MetaAuthorizationInput,
  MetaAuthorizationStart,
} from '@dakly/contracts/channels';
import type { StoreAccess } from '@dakly/contracts/team';
import type { MetaAuthorizationDriver } from '@dakly/providers/channel/channel-driver';
import { MetaRequestError } from '@dakly/providers/channel/meta/meta-graph-channel-driver';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { hashToken } from '../platform/crypto/token-hash';
import { AppError } from '../platform/errors/app-error';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { TeamService } from '../team/team.service';
import { META_AUTHORIZATION_ERRORS } from './meta-authorization.errors';

export const META_AUTHORIZATION_DRIVER = Symbol('META_AUTHORIZATION_DRIVER');

const loginLifetimeSeconds = 10 * 60;

type Actor = { userId: string; access: StoreAccess };

function stateKey(
  storeId: string,
  userId: string,
  kind: 'state' | 'selection',
  value: string,
): string {
  return `meta-auth:${storeId}:${userId}:${kind}:${hashToken(value).toString('hex')}`;
}

function loginError(code: keyof typeof META_AUTHORIZATION_ERRORS) {
  return new AppError(code, META_AUTHORIZATION_ERRORS[code]);
}

@Injectable()
export class MetaAuthorizationService {
  private readonly logger = new Logger(MetaAuthorizationService.name);

  constructor(
    @Inject(META_AUTHORIZATION_DRIVER) private readonly driver: MetaAuthorizationDriver | null,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  async start(storeId: string, actor: Actor): Promise<MetaAuthorizationStart> {
    const driver = this.authorizedDriver(actor.access);
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = driver.authorizationUrl(state);
    await this.valkey.connection.set(
      stateKey(storeId, actor.userId, 'state', state),
      '1',
      'EX',
      loginLifetimeSeconds,
    );
    return { authorizationUrl };
  }

  async listAccounts(
    storeId: string,
    actor: Actor,
    input: MetaAuthorizationInput,
  ): Promise<MetaAuthorizationAccounts> {
    const driver = this.authorizedDriver(actor.access);
    const state = stateKey(storeId, actor.userId, 'state', input.state);
    if (!(await this.valkey.connection.getdel(state)))
      throw loginError('META_LOGIN_STATE_NOT_FOUND');

    const userToken = await this.callMeta('meta_login', 'Meta login measured', () =>
      driver.exchangeAuthorizationCode(input.code),
    );
    const pages = await this.callMeta('meta_accounts', 'Meta account listing measured', () =>
      driver.listAccounts(userToken),
    );
    const selectionId = randomBytes(32).toString('base64url');
    const plaintext = Buffer.from(userToken);
    try {
      const secret = this.encryption.encrypt(
        { owner: 'store', storeId, purpose: 'meta-selection-token' },
        plaintext,
      );
      await this.valkey.connection.set(
        stateKey(storeId, actor.userId, 'selection', selectionId),
        JSON.stringify({
          keyVersion: secret.keyVersion,
          ciphertext: secret.ciphertext.toString('base64'),
        }),
        'EX',
        loginLifetimeSeconds,
      );
    } finally {
      plaintext.fill(0);
    }
    return {
      selectionId,
      pages: pages.map(({ id, name, instagram }) => ({ id, name, instagram })),
    };
  }

  private authorizedDriver(access: StoreAccess): MetaAuthorizationDriver {
    if (!this.team.canManageChannelConnections(access))
      throw loginError('META_LOGIN_ROLE_REQUIRED');
    if (!this.driver) throw loginError('META_LOGIN_UNAVAILABLE');
    return this.driver;
  }

  private async callMeta<Result>(metric: string, message: string, call: () => Promise<Result>) {
    try {
      return await measureVendorCall(this.logger, metric, message, call);
    } catch (error) {
      if (!(error instanceof MetaRequestError)) throw error;
      throw loginError(
        error.code === 'auth_error' ? 'META_LOGIN_REJECTED' : 'META_LOGIN_UNAVAILABLE',
      );
    }
  }
}
