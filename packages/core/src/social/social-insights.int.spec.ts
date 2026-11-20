import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { FakeMetaPublishingDriver } from '@dakly/providers/social/meta/fake-meta-publishing-driver';
import { MetaPublishingError } from '@dakly/providers/social/meta-publishing-driver';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import type { ChannelConnectionsService } from '../channels/channel-connections.service';
import { loadEnv } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS, HOUR_MS } from '../platform/time';
import { SocialInsightsQueueService } from './social-insights-queue.service';
import { SocialInsightsRepository } from './social-insights.repository';
import { SocialInsightsService } from './social-insights.service';
import { SocialPublishRecoveryRepository } from './social-publish-recovery.repository';

describe('SocialInsightsService', () => {
  const fixture = new OwnerIsolationFixture();
  const application = createDatabase(process.env.DATABASE_URL!);
  const publishedAt = new Date('2026-11-20T00:00:00Z');
  const encryption = new EnvelopeEncryption(loadEnv().encryption);
  const queue = new Queue(QUEUES.sync, {
    connection: toRedisConnection(process.env.REDIS_URL!),
    prefix: `insights-tests-${randomUUID()}`,
  });

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await fixture.close();
    await application.pool.end();
  });

  function insights(now: Date, driver = new FakeMetaPublishingDriver()) {
    const secret = encryption.encrypt(
      { owner: 'store', storeId: fixture.a, purpose: 'channel-access-token' },
      Buffer.from('fake-page-token'),
    );
    const postingCredential = vi.fn(async (_storeId: string, channelConnectionId: string) => ({
      ...secret,
      expiresAt: null,
      kind: 'facebook_page' as const,
      externalAccountId: channelConnectionId,
    }));
    const recordRejectedToken = vi.fn(async () => {});
    const service = new SocialInsightsService(
      new SocialInsightsRepository(fixture.tenant),
      { postingCredential, recordRejectedToken } as unknown as ChannelConnectionsService,
      driver,
      encryption,
      { now: () => now },
    );
    const sweep = new SocialInsightsQueueService(
      new SocialPublishRecoveryRepository(application.db),
      { now: () => now },
      queue,
    );
    return { service, sweep, driver, recordRejectedToken };
  }

  async function publishedTarget(nextMetricsAt: Date | null) {
    const postId = randomUUID();
    const channel = randomUUID();
    const target = randomUUID();
    await fixture.connection.pool.query(
      "insert into posts(id,store_id,caption,created_by_user_id) values($1,$2,'Eid sale',$3)",
      [postId, fixture.a, fixture.userA],
    );
    await fixture.connection.pool.query(
      "insert into channel_connections(id,store_id,kind,external_account_id,display_name) values($1::uuid,$2,'facebook_page',$1::text,'Page')",
      [channel, fixture.a],
    );
    await fixture.connection.pool.query(
      "insert into post_targets(id,store_id,post_id,channel_connection_id,status,published_at,external_post_id,next_metrics_at) values($1,$2,$3,$4,'published',$5,$6,$7)",
      [target, fixture.a, postId, channel, publishedAt, `ext-${target}`, nextMetricsAt],
    );
    return { target, externalPostId: `ext-${target}` };
  }

  // Postgres writes whole seconds without a millisecond part, so compare instants, not strings.
  async function metricsTimes(target: string) {
    const row = await fixture.row('post_targets', target);
    const time = (value: unknown) => (typeof value === 'string' ? new Date(value) : null);
    return { metricsAt: time(row.metrics_at), nextMetricsAt: time(row.next_metrics_at), row };
  }

  const sixHoursLater = new Date(publishedAt.getTime() + 6 * HOUR_MS);

  it('saves reach, reactions, comments and shares and schedules the next refresh', async () => {
    const { target, externalPostId } = await publishedTarget(sixHoursLater);
    const { service, driver } = insights(sixHoursLater);
    driver.setMetrics(externalPostId, { reach: 900, reactions: 40, comments: 7, shares: 5 });
    await service.refreshMetrics(fixture.a, target);
    const saved = await metricsTimes(target);
    expect(saved.row).toMatchObject({ reach: 900, reactions: 40, comments: 7, shares: 5 });
    expect(saved.metricsAt).toEqual(sixHoursLater);
    expect(saved.nextMetricsAt).toEqual(new Date(sixHoursLater.getTime() + 6 * HOUR_MS));
  });

  it('writes the same numbers on a repeat run and does not ask Meta again', async () => {
    const { target, externalPostId } = await publishedTarget(sixHoursLater);
    const { service, driver } = insights(sixHoursLater);
    driver.setMetrics(externalPostId, { reach: 50, reactions: 4, comments: 1, shares: 0 });
    const read = vi.spyOn(driver, 'postMetrics');
    await service.refreshMetrics(fixture.a, target);
    const first = await fixture.row('post_targets', target);
    await service.refreshMetrics(fixture.a, target);
    expect(await fixture.row('post_targets', target)).toEqual(first);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not refresh another store’s target', async () => {
    const { target } = await publishedTarget(sixHoursLater);
    const { service, driver } = insights(sixHoursLater);
    const read = vi.spyOn(driver, 'postMetrics');
    await service.refreshMetrics(fixture.b, target);
    expect(read).not.toHaveBeenCalled();
    expect(await fixture.row('post_targets', target)).toMatchObject({ reach: null });
  });

  it('leaves the target due when Meta rate limits the request', async () => {
    const { target } = await publishedTarget(sixHoursLater);
    const { service, driver } = insights(sixHoursLater);
    vi.spyOn(driver, 'postMetrics').mockRejectedValueOnce(new MetaPublishingError('retryable'));
    await expect(service.refreshMetrics(fixture.a, target)).rejects.toMatchObject({
      code: 'retryable',
    });
    expect(await fixture.row('post_targets', target)).toMatchObject({ reach: null });
    await service.refreshMetrics(fixture.a, target);
    expect(await fixture.row('post_targets', target)).toMatchObject({ reach: 120 });
  });

  it('marks the connection for reconnect through the channels service when Meta rejects the token', async () => {
    const { target } = await publishedTarget(sixHoursLater);
    const { service, driver, recordRejectedToken } = insights(sixHoursLater);
    vi.spyOn(driver, 'postMetrics').mockRejectedValueOnce(new MetaPublishingError('auth_error'));
    await service.refreshMetrics(fixture.a, target);
    expect(recordRejectedToken).toHaveBeenCalledOnce();
    const saved = await metricsTimes(target);
    expect(saved.row).toMatchObject({ reach: null });
    expect(saved.nextMetricsAt).toEqual(new Date(sixHoursLater.getTime() + 6 * HOUR_MS));
  });

  it('refreshes daily after a week and stops after day 30', async () => {
    const weekOld = new Date(publishedAt.getTime() + 8 * DAY_MS);
    const daily = await publishedTarget(weekOld);
    await insights(weekOld).service.refreshMetrics(fixture.a, daily.target);
    expect((await metricsTimes(daily.target)).nextMetricsAt).toEqual(
      new Date(weekOld.getTime() + DAY_MS),
    );
    const lastDay = new Date(publishedAt.getTime() + 29.5 * DAY_MS);
    const last = await publishedTarget(lastDay);
    await insights(lastDay).service.refreshMetrics(fixture.a, last.target);
    expect(await fixture.row('post_targets', last.target)).toMatchObject({
      reach: 120,
      next_metrics_at: null,
    });
  });

  it('queues one refresh per due target, once an hour', async () => {
    const now = new Date(publishedAt.getTime() + 12 * HOUR_MS);
    const due = await publishedTarget(new Date(now.getTime() - HOUR_MS));
    // The database function compares with its own clock, so this date must be ahead of the real one.
    const later = await publishedTarget(new Date(Date.now() + DAY_MS));
    const { sweep } = insights(now);
    await sweep.enqueueDueRefreshes();
    await sweep.enqueueDueRefreshes();
    const jobs = await queue.getJobs(['waiting', 'delayed']);
    const queued = jobs.filter(({ data }) => data.postTargetId === due.target);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.data).toEqual({ storeId: fixture.a, postTargetId: due.target });
    expect(jobs.some(({ data }) => data.postTargetId === later.target)).toBe(false);
  });
});
