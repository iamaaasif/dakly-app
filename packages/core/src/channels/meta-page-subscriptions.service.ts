import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  MetaRequestError,
  type MetaAuthorizationDriver,
} from '@dakly/providers/channel/channel-driver';

import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { HOUR_MS } from '../platform/time';
import { META_CHANNEL_DRIVER } from './meta-channel-driver';
import { MetaPageSubscriptionsRepository } from './meta-page-subscriptions.repository';

// A Page login lasts 10 minutes, so a record older than an hour has no selection still running.
const selectionGraceMs = HOUR_MS;

type Subscription = { id: string; pageExternalId: string; ciphertext: Buffer; keyVersion: number };

@Injectable()
export class MetaPageSubscriptionsService {
  private readonly logger = new Logger(MetaPageSubscriptionsService.name);

  constructor(
    @Inject(META_CHANNEL_DRIVER)
    private readonly driver: Pick<MetaAuthorizationDriver, 'unsubscribePage'> | null,
    @Inject(MetaPageSubscriptionsRepository)
    private readonly repository: MetaPageSubscriptionsRepository,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Written before Meta is called, so a crash after the call still leaves a way to undo it.
  async recordPending(storeId: string, pageExternalId: string, accessToken: string) {
    const plaintext = Buffer.from(accessToken);
    try {
      const secret = this.encryption.encrypt(
        { owner: 'store', storeId, purpose: 'channel-access-token' },
        plaintext,
      );
      await this.repository.save(storeId, {
        pageExternalId,
        ciphertext: secret.ciphertext,
        keyVersion: secret.keyVersion,
        now: this.clock.now(),
      });
    } finally {
      plaintext.fill(0);
    }
  }

  // Disconnect clears the connection's token, so the Page token moves here until Meta confirms.
  keepForDisconnect(
    storeId: string,
    pageExternalId: string,
    credential: { ciphertext: Buffer; keyVersion: number },
  ) {
    return this.repository.save(storeId, { pageExternalId, ...credential, now: this.clock.now() });
  }

  forgetPages(storeId: string, pageExternalIds: string[]) {
    return this.repository.removePages(storeId, pageExternalIds);
  }

  async unsubscribeDisconnectedPage(storeId: string, pageExternalId: string) {
    const subscription = await this.repository.findPage(storeId, pageExternalId);
    if (subscription) await this.reconcile(storeId, subscription);
  }

  async reconcileStore(storeId: string) {
    const before = new Date(this.clock.now().getTime() - selectionGraceMs);
    for (const subscription of await this.repository.listCreatedBefore(storeId, before))
      await this.reconcile(storeId, subscription);
  }

  async reconcileAll() {
    const before = new Date(this.clock.now().getTime() - selectionGraceMs);
    let after: string | null = null;
    for (;;) {
      const stores = await this.repository.storesWithSubscriptionsCreatedBefore(before, after);
      const last = stores.at(-1);
      if (!last) return;
      for (const { storeId } of stores) await this.reconcileStore(storeId);
      after = last.storeId;
    }
  }

  private async reconcile(storeId: string, subscription: Subscription) {
    if (!this.driver) return;
    const { id, pageExternalId, ciphertext, keyVersion } = subscription;
    if (await this.repository.isPageConnected(storeId, pageExternalId)) {
      await this.repository.removeIfUnchanged(storeId, id, ciphertext);
      return;
    }
    const driver = this.driver;
    const token = this.encryption.decrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      { ciphertext, keyVersion },
    );
    try {
      await measureVendorCall(
        this.logger,
        'meta_unsubscribe',
        'Meta Page unsubscribe measured',
        () => driver.unsubscribePage(pageExternalId, token.toString()),
      );
    } catch (error) {
      if (!(error instanceof MetaRequestError)) throw error;
      // The record stays, so the next daily run tries again.
      this.logger.warn(`Meta Page unsubscribe failed: ${error.code}`);
      return;
    } finally {
      token.fill(0);
    }
    await this.repository.removeIfUnchanged(storeId, id, ciphertext);
  }
}
