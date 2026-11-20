import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  MetaPublishingError,
  type MetaPublishingDriver,
} from '@dakly/providers/social/meta-publishing-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { measureVendorCall } from '../platform/logging/vendor-call-metric';
import { nextMetricsAt } from './next-metrics-at';
import { SocialInsightsRepository } from './social-insights.repository';
import { META_PUBLISHING_DRIVER } from './social-publishing.service';

@Injectable()
export class SocialInsightsService {
  private readonly logger = new Logger(SocialInsightsService.name);

  constructor(
    @Inject(SocialInsightsRepository) private readonly repository: SocialInsightsRepository,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(META_PUBLISHING_DRIVER) private readonly driver: MetaPublishingDriver,
    @Inject(EnvelopeEncryption) private readonly encryption: EnvelopeEncryption,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async refreshMetrics(storeId: string, postTargetId: string) {
    const now = this.clock.now();
    const target = await this.repository.findMetricsTarget(storeId, postTargetId, now);
    if (!target?.nextMetricsAt || !target.publishedAt || !target.externalPostId) return;
    const { nextMetricsAt: dueAt } = target;
    const schedule = { nextMetricsAt: nextMetricsAt(target.publishedAt, now) };
    // The schedule moves on even when nothing could be read, so a dead account is not retried hourly.
    const metrics = await this.readMetrics(storeId, {
      ...target,
      externalPostId: target.externalPostId,
    });
    await this.repository.saveMetrics(
      storeId,
      postTargetId,
      dueAt,
      metrics ? { ...metrics, metricsAt: now, ...schedule } : schedule,
    );
  }

  private async readMetrics(
    storeId: string,
    target: { channelConnectionId: string; externalPostId: string; postKind: string },
  ) {
    const credential = await this.channels.postingCredential(storeId, target.channelConnectionId);
    if (!credential || (credential.expiresAt && credential.expiresAt <= this.clock.now())) return;
    const account = {
      accountId: credential.externalAccountId,
      accessToken: this.encryption
        .decrypt({ owner: 'store', storeId, purpose: 'channel-access-token' }, credential)
        .toString('utf8'),
    };
    const post = {
      kind: credential.kind,
      externalPostId: target.externalPostId,
      isStory: target.postKind === 'story',
    };
    try {
      const { rejectedInsights, ...metrics } = await measureVendorCall(
        this.logger,
        'post_metrics',
        'Meta post metrics request measured',
        () => this.driver.postMetrics(account, post),
      );
      if (rejectedInsights)
        this.logger.warn(`Meta rejected the insights metric ${rejectedInsights}`);
      return metrics;
    } catch (failure) {
      if (!(failure instanceof MetaPublishingError)) throw failure;
      // A rate limit or outage retries through the queue; anything else would fail again.
      if (failure.code === 'retryable' || failure.code === 'unavailable') throw failure;
      if (failure.code === 'auth_error')
        await this.channels
          .recordRejectedToken(storeId, target.channelConnectionId, credential.ciphertext)
          .catch(() => this.logger.error('Could not record the rejected Meta credential'));
    }
  }
}
