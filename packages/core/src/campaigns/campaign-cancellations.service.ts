import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { countSmsParts } from '@dakly/contracts/sms';

import { LinksService } from '../links/links.service';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../platform/time';
import { SmsService } from '../sms/sms.service';
import { CampaignCancellationsRepository } from './campaign-cancellations.repository';
import { CampaignsService, marketingSmsText } from './campaigns.service';

const SWEEP_CURSOR = 'campaign-cancellation:store';
const CURSOR_TTL = (7 * DAY_MS) / 1000;
const STORES_PER_SWEEP = 100;
const MAX_WAITING = 1_000;
const LEASE_MS = 5 * MINUTE_MS;
const ACTOR = { kind: 'system' } as const;
export const SETTLE_CANCELLED_CAMPAIGN = 'settle-cancelled-campaign';
type SettleJob = { storeId: string; campaignId: string };

@Injectable()
export class CampaignCancellationsService {
  private readonly logger = new Logger(CampaignCancellationsService.name);

  constructor(
    @Inject(CampaignCancellationsRepository)
    private readonly repository: CampaignCancellationsRepository,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(SmsService) private readonly sms: SmsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue<SettleJob>,
  ) {}

  async sweep(): Promise<void> {
    const limit = Math.min(STORES_PER_SWEEP, MAX_WAITING - (await this.queue.getWaitingCount()));
    if (limit <= 0) return;
    const after = await this.valkey.connection.get(SWEEP_CURSOR);
    let stores = await this.repository.listStores(after, limit);
    if (!stores.length && after) stores = await this.repository.listStores(null, limit);
    const jobs: SettleJob[] = [];
    for (const storeId of stores) {
      const campaignId = await this.repository.firstPending(storeId).catch((error: unknown) => {
        this.logger.error({ storeId }, 'Campaign cancellation lookup failed');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      });
      if (campaignId) jobs.push({ storeId, campaignId });
    }
    if (jobs.length)
      await this.queue.addBulk(
        jobs.map((data) => ({
          name: SETTLE_CANCELLED_CAMPAIGN,
          data,
          opts: {
            deduplication: { id: `cancel-${data.storeId}` },
            attempts: 3,
            backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        })),
      );
    const last = stores.at(-1);
    if (last) await this.valkey.connection.set(SWEEP_CURSOR, last, 'EX', CURSOR_TTL);
  }

  async settle({ storeId, campaignId }: SettleJob): Promise<void> {
    const pendingReceipt = await this.transaction.run(storeId, async () => {
      const campaign = await this.repository.lockPending(storeId, campaignId);
      if (!campaign?.approvedAt) return;
      const now = this.clock.now();
      const before = new Date(now.getTime() - LEASE_MS);
      const url = this.links.sampleOptOutUrl(campaign.shortLinkBase ?? undefined);
      const credits = countSmsParts(marketingSmsText(campaign.content.text, url));
      await this.repository.expireUnknown(storeId, campaignId, {
        before,
        now,
        smsCredits: credits,
      });
      const claim = await this.repository.claimReceipt(storeId, campaignId, before, now);
      if (claim) return { claim, credits };
      await this.campaigns.settleCancellation(storeId, campaignId, {
        approvedAt: campaign.approvedAt,
        now,
        actor: ACTOR,
      });
    });
    if (!pendingReceipt) return;

    const { claim, credits } = pendingReceipt;
    const outcome = await this.sms.receiptStatus({
      providerMessageId: claim.providerMessageId,
      idempotencyKey: `campaign-${claim.id}`,
    });
    await this.transaction.run(storeId, async () => {
      const campaign = await this.repository.lockPending(storeId, campaignId);
      if (!campaign?.approvedAt) return;
      const now = this.clock.now();
      await this.repository.recordReceipt(
        storeId,
        campaignId,
        claim,
        outcome === 'sent'
          ? {
              status: 'sent',
              sentAt: claim.dispatchStartedAt,
              claimedAt: null,
              smsCredits: credits,
            }
          : {
              status: 'failed',
              failedAt: now,
              claimedAt: outcome === 'not_sent' ? null : undefined,
              errorCode: outcome === 'not_sent' ? 'provider_confirmed_not_sent' : 'outcome_unknown',
              smsCredits: outcome === 'not_sent' ? null : credits,
            },
      );
      await this.campaigns.settleCancellation(storeId, campaignId, {
        approvedAt: campaign.approvedAt,
        now,
        actor: ACTOR,
      });
    });
  }
}
