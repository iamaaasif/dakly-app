import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  MetaAuthorizationAccounts,
  MetaAuthorizationInput,
  MetaAuthorizationStart,
  MetaSelectionInput,
} from '@dakly/contracts/channels';
import type { StoreAccess } from '@dakly/contracts/team';
import {
  MetaRequestError,
  type MetaAuthorizationDriver,
  type MetaPage,
} from '@dakly/providers/channel/channel-driver';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { hashToken } from '../platform/crypto/token-hash';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { OutboxService } from '../platform/outbox/outbox.service';
import { TeamService } from '../team/team.service';
import { ChannelConnectionsRepository } from './channel-connections.repository';
import { META_AUTHORIZATION_ERRORS } from './meta-authorization.errors';

export const META_AUTHORIZATION_DRIVER = Symbol('META_AUTHORIZATION_DRIVER');

const loginLifetimeSeconds = 10 * 60;

type Actor = { userId: string; sessionId: string; access: StoreAccess };

function stateKey(
  storeId: string,
  actor: Actor,
  kind: 'state' | 'selection',
  value: string,
): string {
  return `meta-auth:${storeId}:${actor.userId}:${actor.sessionId}:${kind}:${hashToken(value).toString('hex')}`;
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
    @Inject(ChannelConnectionsRepository)
    private readonly connections: ChannelConnectionsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async start(storeId: string, actor: Actor): Promise<MetaAuthorizationStart> {
    const driver = this.authorizedDriver(actor.access);
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = driver.authorizationUrl(state);
    await this.valkey.connection.set(
      stateKey(storeId, actor, 'state', state),
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
    const state = stateKey(storeId, actor, 'state', input.state);
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
        stateKey(storeId, actor, 'selection', selectionId),
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

  async connect(storeId: string, actor: Actor, input: MetaSelectionInput) {
    const driver = this.authorizedDriver(actor.access);
    const key = stateKey(storeId, actor, 'selection', input.selectionId);
    const claim = `${key}:claimed`;
    const cache = this.valkey.connection;
    // The claim outlives the grant, which cannot be used after it expires.
    if (!(await cache.set(claim, '1', 'EX', loginLifetimeSeconds, 'NX')))
      throw loginError('META_SELECTION_IN_PROGRESS');

    try {
      const packed = await cache.get(key);
      if (!packed) throw loginError('META_SELECTION_NOT_FOUND');
      const pages = await this.listSelectedGrantPages(storeId, driver, packed);
      const selected = this.selectAccounts(pages, input.accounts);
      if (await this.connections.hasForeignOwner(storeId, selected))
        throw loginError('META_ACCOUNT_ALREADY_CONNECTED');
      const subscriptions = new Map(selected.map(({ page }) => [page.id, page.accessToken]));
      await Promise.all(
        [...subscriptions].map(([id, token]) =>
          this.callMeta('meta_subscribe', 'Meta Page subscription measured', () =>
            driver.subscribePage(id, token),
          ),
        ),
      );
      const now = this.clock.now();
      const ids = await this.transaction.runLocked(storeId, async () => {
        const ids: string[] = [];
        for (const { page, ...account } of selected) {
          const secret = this.encryptPageToken(storeId, page.accessToken);
          const saved = await this.connections.saveMeta(
            storeId,
            {
              ...account,
              accessTokenCiphertext: secret.ciphertext,
              keyVersion: secret.keyVersion,
              connectedByUserId: actor.userId,
            },
            now,
          );
          if (!saved) throw loginError('META_ACCOUNT_ALREADY_CONNECTED');
          ids.push(saved.id);
          if (saved.connected)
            await this.outbox.publish({
              type: 'channel.connected',
              storeId,
              occurredAt: now.toISOString(),
              payload: { channelConnectionId: saved.id },
            });
        }
        return ids;
      });
      await cache.del(key);
      return { ids };
    } catch (error) {
      if (error instanceof AppError && (error.status === 400 || error.status === 409))
        await cache.del(key);
      throw error;
    } finally {
      await cache.del(claim);
    }
  }

  private async listSelectedGrantPages(
    storeId: string,
    driver: MetaAuthorizationDriver,
    packed: string,
  ) {
    const { ciphertext, keyVersion } = JSON.parse(packed) as {
      ciphertext: string;
      keyVersion: number;
    };
    const plaintext = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'meta-selection-token' },
      { ciphertext: Buffer.from(ciphertext, 'base64'), keyVersion },
    );
    try {
      return await this.callMeta('meta_accounts', 'Meta account listing measured', () =>
        driver.listAccounts(plaintext.toString()),
      );
    } finally {
      plaintext.fill(0);
    }
  }

  private selectAccounts(pages: MetaPage[], accounts: MetaSelectionInput['accounts']) {
    const eligible = new Map<string, { page: MetaPage; displayName: string }>();
    for (const page of pages) {
      eligible.set(`facebook_page:${page.id}`, { page, displayName: page.name });
      if (page.instagram)
        eligible.set(`instagram:${page.instagram.id}`, { page, displayName: page.instagram.name });
    }
    const requested = new Map(
      accounts.map((account) => [`${account.kind}:${account.externalAccountId}`, account]),
    );
    // Use the same write order for selections that share accounts.
    return [...requested]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, account]) => {
        const match = eligible.get(key);
        if (!match) throw loginError('META_ACCOUNT_UNAVAILABLE');
        return { ...account, ...match };
      });
  }

  private encryptPageToken(storeId: string, token: string) {
    const plaintext = Buffer.from(token);
    try {
      return this.encryption.encrypt(
        { owner: 'store', storeId, purpose: 'channel-access-token' },
        plaintext,
      );
    } finally {
      plaintext.fill(0);
    }
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
