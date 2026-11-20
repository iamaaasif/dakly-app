import { Inject, Injectable } from '@nestjs/common';

import type { CampaignApprovalFailureCode } from '@dakly/contracts/campaigns';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { WalletService } from '../wallets/wallet.service';
import {
  type ApprovalKey,
  type ApprovalState,
  CampaignApprovalRepository,
} from './campaign-approval.repository';
import {
  type AudiencePage,
  audienceDecisionTime,
  CampaignAudienceService,
} from './campaign-audience.service';
import { CampaignSmsService } from './campaign-sms.service';
import { CampaignsRepository } from './campaigns.repository';
import { approvalKey } from './campaigns.service';

// A run stops after this long and asks to run again, so one large approval does not hold the
// campaign queue's single worker slot while other stores wait to send.
const RUN_MS = 10_000;
const REMOVE_BATCH = 5_000;

type Step = 'more' | 'done';

@Injectable()
export class CampaignApprovalService {
  constructor(
    @Inject(CampaignApprovalRepository) private readonly approvals: CampaignApprovalRepository,
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(CampaignAudienceService) private readonly audience: CampaignAudienceService,
    @Inject(CampaignSmsService) private readonly sms: CampaignSmsService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Safe to run again at any point: each page commits its rows and the cursor together, a
  // repeated page writes nothing new, and a finished or changed approval is left alone.
  async build(storeId: string, key: ApprovalKey): Promise<void | { delayUntil: number }> {
    const deadline = this.clock.now().getTime() + RUN_MS;
    for (;;) {
      const state = await this.approvals.findApproval(storeId, key);
      if (!state) return;
      if ((await this.step(storeId, key, state)) === 'done') return;
      if (this.clock.now().getTime() >= deadline) return { delayUntil: this.clock.now().getTime() };
    }
  }

  private step(storeId: string, key: ApprovalKey, state: ApprovalState): Promise<Step> {
    if (state.approvalFailureCode) return this.undo(storeId, key, state.approvalFailureCode);
    if (state.segmentIndex >= state.includeSegmentIds.length)
      return this.finish(storeId, key, state);
    return this.addPage(storeId, key, state);
  }

  private async addPage(storeId: string, key: ApprovalKey, state: ApprovalState): Promise<Step> {
    let page: AudiencePage;
    try {
      page = await this.audience.page(
        storeId,
        state,
        { segmentIndex: state.segmentIndex, contactId: state.contactId },
        audienceDecisionTime(state, key.approvedAt),
      );
    } catch (error) {
      // A segment deleted after approval started would fail every retry; refuse instead.
      if (!(error instanceof AppError) || error.code !== 'SEGMENT_NOT_FOUND') throw error;
      await this.approvals.markApprovalFailing(storeId, key, 'SEGMENT_NOT_FOUND', this.clock.now());
      return 'more';
    }
    await this.transaction.run(storeId, async () => {
      const saved = await this.approvals.saveApprovalProgress(
        storeId,
        key,
        { ...page.next, checkedCount: state.approvalCheckedCount + page.checked },
        this.clock.now(),
      );
      if (saved && page.recipients.length)
        await this.campaigns.insertRecipients(storeId, key.id, page.recipients);
    });
    return 'more';
  }

  // Reserves only here, once the final counts are known, so a refusal has nothing to release.
  private async finish(storeId: string, key: ApprovalKey, state: ApprovalState): Promise<Step> {
    let failure: CampaignApprovalFailureCode | null;
    try {
      failure = await this.approveFrozen(storeId, key, state);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'WALLET_BALANCE_TOO_LOW') throw error;
      failure = 'WALLET_BALANCE_TOO_LOW';
    }
    if (!failure) return 'done';
    await this.approvals.markApprovalFailing(storeId, key, failure, this.clock.now());
    return 'more';
  }

  // One short store transaction: the credits, the status and the event commit together.
  private approveFrozen(
    storeId: string,
    key: ApprovalKey,
    state: ApprovalState,
  ): Promise<CampaignApprovalFailureCode | null> {
    return this.transaction.run(storeId, async () => {
      if (!(await this.isStillApproving(storeId, key))) return null;
      const now = this.clock.now();
      const counts = await this.approvals.countFrozenRecipients(storeId, key.id);
      const refusal = approvalRefusal(state, counts.queued, now);
      if (refusal) return refusal;
      await this.reserveAndApprove(storeId, key, state, { ...counts, now });
      return null;
    });
  }

  // Locks the campaign, so an approval that moved on meanwhile is left alone.
  private async isStillApproving(storeId: string, key: ApprovalKey): Promise<boolean> {
    const locked = await this.campaigns.lockCampaign(storeId, key.id, 'update');
    return (
      locked?.status === 'approving' && locked.approvedAt?.getTime() === key.approvedAt.getTime()
    );
  }

  private async reserveAndApprove(
    storeId: string,
    key: ApprovalKey,
    state: ApprovalState,
    { queued, skipped, now }: { queued: number; skipped: number; now: Date },
  ): Promise<void> {
    // Messenger sends are free: no credits to reserve and no short links.
    let shortLinkBase: string | null = null;
    if (state.channel === 'sms') {
      const estimate = this.sms.estimate(state.content.text);
      shortLinkBase = estimate.shortLinkBase;
      await this.wallets.reserve(storeId, {
        wallet: 'sms_credits',
        quantity: estimate.smsParts * queued,
        idempotencyKey: approvalKey(key.id, key.approvedAt),
        actor: state.approvedByUserId
          ? { kind: 'user', userId: state.approvedByUserId }
          : { kind: 'system' },
      });
    }
    const status = state.scheduledFor ? 'scheduled' : 'sending';
    await this.campaigns.markApproved(storeId, key.id, {
      status,
      shortLinkBase,
      startedAt: status === 'sending' ? now : null,
      updatedAt: now,
      estimatedCostPoisha: 0,
      recipientsCount: queued,
      skippedCount: skipped,
    });
    await this.outbox.publish({
      type: 'campaign.approved',
      storeId,
      occurredAt: now.toISOString(),
      payload: { campaignId: key.id, status },
    });
  }

  // Bounded deletes, then the campaign goes back to draft with the reason.
  private async undo(
    storeId: string,
    key: ApprovalKey,
    code: CampaignApprovalFailureCode,
  ): Promise<Step> {
    if ((await this.approvals.removeRecipientsBatch(storeId, key.id, REMOVE_BATCH)) > 0)
      return 'more';
    await this.approvals.failApproval(storeId, key, code, this.clock.now());
    return 'done';
  }
}

function approvalRefusal(
  state: ApprovalState,
  queued: number,
  now: Date,
): CampaignApprovalFailureCode | null {
  if (state.scheduledFor && state.scheduledFor <= now) return 'CAMPAIGN_SEND_TIME_PASSED';
  return queued === 0 ? 'CAMPAIGN_NO_RECIPIENTS' : null;
}
