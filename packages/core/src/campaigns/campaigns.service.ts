import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  messengerCampaignContentSchema,
  smsCampaignContentSchema,
} from '@dakly/contracts/campaigns';
import type {
  CampaignChannel,
  CampaignEstimateResponse,
  CampaignListQuery,
  CampaignListResponse,
  CampaignResponse,
  CampaignStatus,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';
import type { StoreAccess } from '@dakly/contracts/team';

import { AnalyticsService } from '../analytics/analytics.service';
import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { SegmentsService } from '../segments/segments.service';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { WalletService } from '../wallets/wallet.service';
import { CampaignAnalyticsRepository } from './campaign-analytics.repository';
import { CampaignApprovalRepository } from './campaign-approval.repository';
import { audienceDecisionTime, CampaignAudienceService } from './campaign-audience.service';
import { CampaignMessageTotalsRepository } from './campaign-message-totals.repository';
import { toCampaignResponse } from './campaign-response';
import { CampaignSmsService } from './campaign-sms.service';
import { campaignError, type CampaignErrorCode } from './campaigns.errors';
import {
  type Campaign,
  CampaignsRepository,
  type CampaignStatusChange,
  type CampaignStatusGuard,
  type FrozenRecipient,
} from './campaigns.repository';

// Writes take the actor (services.md); nothing records it for drafts yet.
type Actor = AuditEntry['actor'];

type StatusChange = { from: CampaignStatusGuard; to: CampaignStatus; refused: CampaignErrorCode };

// The changes a member makes by hand (state-machines.md); the sender (CAMP-3) makes the rest.
// Only a manual pause resumes by hand: a balance pause resumes on top-up (CAMP-3), and the
// others when their cause clears (CAMP-3, CHN-3).
const STATUS_CHANGES = {
  unschedule: { from: { status: 'scheduled' }, to: 'draft', refused: 'CAMPAIGN_NOT_SCHEDULED' },
  pause: { from: { status: 'sending' }, to: 'paused', refused: 'CAMPAIGN_NOT_SENDING' },
  resume: {
    from: { status: 'paused', pauseReason: 'manual' },
    to: 'sending',
    refused: 'CAMPAIGN_NOT_PAUSED',
  },
} as const satisfies Record<string, StatusChange>;
// The estimate runs in the request, so it reads this many contacts and then stops.
const ESTIMATE_CONTACT_LIMIT = 20_000;
// Cancel and unschedule need an approved campaign; approving is cancelled in a later task.
const NOT_YET_APPROVED: CampaignStatus[] = ['draft', 'waiting_approval', 'approving'];
// CAMP-R7: a scheduled campaign can be edited until 5 minutes before it sends.
const LAST_CHANGE_BEFORE_SEND_MS = 5 * 60 * 1000;

const PURGE_BATCH = 5000;

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(CampaignsRepository) private readonly repository: CampaignsRepository,
    @Inject(CampaignMessageTotalsRepository)
    private readonly messageTotalsRepository: CampaignMessageTotalsRepository,
    @Inject(CampaignAnalyticsRepository)
    private readonly analyticsRepository: CampaignAnalyticsRepository,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(CampaignAudienceService) private readonly audience: CampaignAudienceService,
    @Inject(CampaignApprovalRepository) private readonly approvals: CampaignApprovalRepository,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(CampaignSmsService) private readonly sms: CampaignSmsService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
  ) {}

  async list(storeId: string, query: CampaignListQuery): Promise<CampaignListResponse> {
    const timeZone =
      query.createdFrom || query.createdThrough ? await this.stores.timeZone(storeId) : null;
    const rows = await this.repository.list(storeId, { ...query, timeZone });
    const page = rows.slice(0, query.limit).map(toCampaignResponse);
    const results = await this.reports.campaignAttribution(
      storeId,
      page.map(({ id }) => id),
    );
    const items = page.map((item) => ({ ...item, attribution: results[item.id] }));
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  messageTotals(storeId: string, range: { from: string; through: string; timeZone: string }) {
    return this.messageTotalsRepository.messageTotals(storeId, range);
  }

  startedBetween(storeId: string, range: { from: string; through: string; timeZone: string }) {
    return this.analyticsRepository.startedBetween(storeId, range);
  }

  attributionSources(storeId: string, buyer: { id: string; phone: string }, ids: string[]) {
    return ids.length ? this.repository.attributionSources(storeId, buyer, ids) : [];
  }

  async get(storeId: string, campaignId: string): Promise<CampaignResponse> {
    const campaign = await this.find(storeId, campaignId);
    const results = await this.reports.campaignAttribution(storeId, [campaignId]);
    return { ...toCampaignResponse(campaign), attribution: results[campaignId] };
  }

  async create(
    storeId: string,
    input: CreateCampaignInput,
    actor: Actor,
  ): Promise<CampaignResponse> {
    const channelConnectionId = input.channel === 'messenger' ? input.channelConnectionId : null;
    if (channelConnectionId) await this.channels.requireFacebookPage(storeId, channelConnectionId);
    const campaign = await this.repository.insert(storeId, {
      ...input,
      channelConnectionId,
      scheduledFor: input.scheduledFor === null ? null : new Date(input.scheduledFor),
      createdByUserId: actor.kind === 'user' ? actor.userId : null,
    });
    return toCampaignResponse(campaign);
  }

  async changeDraft(
    storeId: string,
    campaignId: string,
    { scheduledFor, ...input }: ChangeCampaignInput,
    _actor: Actor,
  ): Promise<CampaignResponse> {
    await this.checkChangeFitsChannel(storeId, campaignId, input);
    const campaign = await this.repository.changeDraft(storeId, campaignId, {
      ...input,
      ...(scheduledFor !== undefined && {
        scheduledFor: scheduledFor === null ? null : new Date(scheduledFor),
      }),
      updatedAt: this.clock.now(),
    });
    if (!campaign) throw await this.refusal(storeId, campaignId, 'CAMPAIGN_NOT_DRAFT');
    return toCampaignResponse(campaign);
  }

  // The channel cannot change after a draft is made, so reading it outside the guarded write is safe.
  private async checkChangeFitsChannel(
    storeId: string,
    campaignId: string,
    { content, channelConnectionId }: Pick<ChangeCampaignInput, 'content' | 'channelConnectionId'>,
  ) {
    const { channel } = await this.find(storeId, campaignId);
    const messenger = channel === 'messenger';
    const contentFits =
      content === undefined ||
      (messenger ? messengerCampaignContentSchema : smsCampaignContentSchema).safeParse(content)
        .success;
    if (!contentFits || (channelConnectionId !== undefined && !messenger))
      throw campaignError('CAMPAIGN_CHANGE_NOT_FOR_CHANNEL');
    if (channelConnectionId) await this.channels.requireFacebookPage(storeId, channelConnectionId);
  }

  async removeDraft(storeId: string, campaignId: string, _actor: Actor): Promise<void> {
    if (!(await this.repository.removeDraft(storeId, campaignId)))
      throw await this.refusal(storeId, campaignId, 'CAMPAIGN_NOT_DRAFT');
  }

  async estimate(storeId: string, campaignId: string): Promise<CampaignEstimateResponse> {
    const campaign = await this.find(storeId, campaignId);
    if (campaign.status !== 'draft') throw campaignError('CAMPAIGN_NOT_DRAFT');
    const { recipients, isComplete } = await this.sampleAudience(storeId, campaign);
    const smsParts =
      campaign.channel === 'sms' ? this.sms.estimate(campaign.content.text).smsParts : 0;
    return toEstimate(recipients, smsParts, isComplete);
  }

  // The request does the cheap checks and marks the draft approving. A job (CAMP-13) freezes the
  // audience in batches, then reserves the credits and moves the campaign on.
  async approve(
    storeId: string,
    campaignId: string,
    approver: { access: StoreAccess; actor: Actor },
  ): Promise<CampaignResponse> {
    const { onlyOwnersAndAdminsApprove } = await this.stores.sendingSettings(storeId);
    if (onlyOwnersAndAdminsApprove && !this.team.canApproveSends(approver.access))
      throw campaignError('CAMPAIGN_APPROVAL_DENIED');
    return this.transaction.run(storeId, async () => {
      const campaign = await this.repository.lockDraft(storeId, campaignId);
      if (!campaign) throw await this.refusal(storeId, campaignId, 'CAMPAIGN_NOT_DRAFT');
      if (!campaign.content.text) throw campaignError('CAMPAIGN_TEXT_EMPTY');
      const now = this.clock.now();
      if (campaign.scheduledFor && campaign.scheduledFor <= now)
        throw campaignError('CAMPAIGN_SEND_TIME_PASSED');
      const estimatedTotal = await this.segmentSize(storeId, campaign);
      if (estimatedTotal === 0) throw campaignError('CAMPAIGN_NO_RECIPIENTS');
      const approving = await this.approvals.markApproving(storeId, campaignId, {
        approvedByUserId: approver.actor.kind === 'user' ? approver.actor.userId : null,
        approvedAt: now,
        updatedAt: now,
        approvalEstimatedTotal: estimatedTotal,
      });
      if (!approving) throw campaignError('CAMPAIGN_NOT_DRAFT');
      await this.outbox.publish({
        type: 'campaign.approval_started',
        storeId,
        occurredAt: now.toISOString(),
        payload: { campaignId, approvedAt: now.toISOString() },
      });
      return toCampaignResponse(approving);
    });
  }

  // Back to draft: the frozen recipients go, so a new approval freezes the audience again.
  async unschedule(storeId: string, campaignId: string, actor: Actor): Promise<CampaignResponse> {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.lockBeforeSend(storeId, campaignId);
      await this.repository.removeRecipients(storeId, campaignId);
      const draft = await this.changeStatus(storeId, campaignId, 'unschedule', {
        approvedByUserId: null,
        approvedAt: null,
        shortLinkBase: null,
        estimatedCostPoisha: null,
        recipientsCount: 0,
        skippedCount: 0,
      });
      await this.settleReservation(
        storeId,
        { id: campaignId, channel: campaign.channel, approvedAt: campaign.approvedAt! },
        actor,
      );
      return draft;
    });
  }

  async cancel(storeId: string, campaignId: string, actor: Actor): Promise<CampaignResponse> {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.repository.lockCampaign(storeId, campaignId, 'update');
      if (!campaign) throw campaignError('CAMPAIGN_NOT_FOUND');
      if (NOT_YET_APPROVED.includes(campaign.status)) throw campaignError('CAMPAIGN_NOT_SCHEDULED');
      if (
        campaign.status === 'sent' ||
        campaign.status === 'failed' ||
        campaign.status === 'cancelled'
      )
        throw campaignError('CAMPAIGN_NOT_CANCELLABLE');
      await this.repository.cancelQueuedRecipients(storeId, campaignId);
      const now = this.clock.now();
      const cancelled = await this.repository.changeStatus(
        storeId,
        campaignId,
        { status: campaign.status },
        {
          status: 'cancelled',
          pauseReason: null,
          balancePauseRevision: null,
          finishedAt: now,
          updatedAt: now,
          settlementPendingAt: campaign.approvedAt ? now : null,
          countsAt: null,
        },
      );
      if (!cancelled) throw campaignError('CAMPAIGN_NOT_CANCELLABLE');
      if (campaign.approvedAt)
        await this.settleReservation(
          storeId,
          {
            id: campaignId,
            channel: campaign.channel,
            approvedAt: campaign.approvedAt,
            cancelledAt: now,
          },
          actor,
        );
      return toCampaignResponse(cancelled);
    });
  }

  async pause(storeId: string, campaignId: string, _actor: Actor): Promise<CampaignResponse> {
    return this.changeStatus(storeId, campaignId, 'pause', {
      pauseReason: 'manual',
      countsAt: null,
    });
  }

  async resume(storeId: string, campaignId: string, _actor: Actor): Promise<CampaignResponse> {
    return this.changeStatus(storeId, campaignId, 'resume', { pauseReason: null });
  }

  private async lockBeforeSend(storeId: string, campaignId: string) {
    const campaign = await this.repository.lockScheduled(storeId, campaignId);
    if (!campaign) throw await this.refusal(storeId, campaignId, 'CAMPAIGN_NOT_SCHEDULED');
    // Approval schedules a campaign only with a send time.
    const untilSend = campaign.scheduledFor!.getTime() - this.clock.now().getTime();
    if (untilSend < LAST_CHANGE_BEFORE_SEND_MS) throw campaignError('CAMPAIGN_CHANGE_TOO_LATE');
    return campaign;
  }

  // The caller holds the campaign lock. Take the wallet lock last.
  async settleReservation(
    storeId: string,
    {
      id,
      channel,
      approvedAt,
      cancelledAt,
    }: { id: string; channel: CampaignChannel; approvedAt: Date; cancelledAt?: Date },
    actor: Actor,
  ): Promise<boolean> {
    const { unsettled, chargedCredits } = await this.repository.settlementTotals(storeId, id);
    if (unsettled > 0) return false;
    if (cancelledAt && !(await this.repository.markSettled(storeId, id, cancelledAt))) return false;
    // Only SMS holds credits.
    if (channel !== 'sms') return true;
    const key = approvalKey(id, approvedAt);
    const replacement = approvalKey(id, approvedAt, 'with-opt-out');
    const adjusted = await this.wallets.findByIdempotencyKey(storeId, replacement);
    const reservation = await this.wallets.reservationFor(
      storeId,
      'sms_credits',
      adjusted ? replacement : key,
    );
    const quantity = Math.min(chargedCredits, reservation.quantity);
    const write = { reservationId: reservation.entryId, actor };
    if (quantity)
      await this.wallets.charge(storeId, { ...write, quantity, idempotencyKey: `${key}:charge` });
    else await this.wallets.release(storeId, { ...write, idempotencyKey: `${key}:release` });
    return true;
  }

  private async changeStatus(
    storeId: string,
    campaignId: string,
    name: keyof typeof STATUS_CHANGES,
    change: Omit<CampaignStatusChange, 'status' | 'updatedAt'> = {},
  ): Promise<CampaignResponse> {
    const { from, to, refused }: StatusChange = STATUS_CHANGES[name];
    const campaign = await this.repository.changeStatus(storeId, campaignId, from, {
      ...change,
      status: to,
      updatedAt: this.clock.now(),
    });
    if (campaign) return toCampaignResponse(campaign);
    // Read only to name the refusal; the guarded update has already decided.
    const pauseReason =
      from.pauseReason && (await this.repository.findPauseReason(storeId, campaignId));
    if (pauseReason && pauseReason !== from.pauseReason) {
      throw campaignError('CAMPAIGN_PAUSED_BY_SYSTEM', [
        { path: 'pauseReason', message: pauseReason },
      ]);
    }
    throw await this.refusal(storeId, campaignId, refused);
  }

  // The upper bound shown as progress: segments can overlap and exclusions apply. A segment id
  // that does not exist is refused here.
  private async segmentSize(storeId: string, campaign: Campaign): Promise<number> {
    let total = 0;
    for (const segmentId of campaign.includeSegmentIds)
      total += await this.segments.contactCount(storeId, segmentId);
    for (const segmentId of campaign.excludeSegmentIds)
      await this.segments.assertExists(storeId, segmentId);
    return total;
  }

  private async sampleAudience(storeId: string, campaign: Campaign) {
    const recipients = new Map<string, FrozenRecipient>();
    let cursor = { segmentIndex: 0, contactId: null as string | null };
    let checked = 0;
    const at = audienceDecisionTime(campaign, this.clock.now());
    while (cursor.segmentIndex < campaign.includeSegmentIds.length) {
      const page = await this.audience.page(storeId, campaign, cursor, at);
      for (const recipient of page.recipients)
        if (!recipients.has(recipient.contactId)) recipients.set(recipient.contactId, recipient);
      checked += page.checked;
      cursor = page.next;
      if (checked >= ESTIMATE_CONTACT_LIMIT && !page.isLast)
        return { recipients: [...recipients.values()], isComplete: false };
    }
    return { recipients: [...recipients.values()], isComplete: true };
  }

  private async find(storeId: string, campaignId: string): Promise<Campaign> {
    const campaign = await this.repository.find(storeId, campaignId);
    if (!campaign) throw campaignError('CAMPAIGN_NOT_FOUND');
    return campaign;
  }

  // The guarded write found nothing: say whether the campaign is missing or in another state.
  private async refusal(storeId: string, campaignId: string, code: CampaignErrorCode) {
    await this.find(storeId, campaignId);
    return campaignError(code);
  }

  async purgeExpiredRecipients(storeId: string): Promise<void> {
    while (await this.repository.purgeExpiredRecipientsBatch(storeId, PURGE_BATCH));
  }
}

// Holds the approval time, so a campaign approved again after an edit reserves anew.
export function approvalKey(campaignId: string, approvedAt: Date, suffix?: 'with-opt-out'): string {
  const key = `campaign-approval:${campaignId}:${approvedAt.toISOString()}`;
  return suffix ? `${key}:${suffix}` : key;
}

function toEstimate(
  recipients: FrozenRecipient[],
  smsParts: number,
  isComplete: boolean,
): CampaignEstimateResponse {
  const skippedByReason: CampaignEstimateResponse['skippedByReason'] = {};
  for (const { skipReason } of recipients)
    if (skipReason) skippedByReason[skipReason] = (skippedByReason[skipReason] ?? 0) + 1;
  const recipientsCount = recipients.filter((recipient) => recipient.status === 'queued').length;
  return {
    isComplete,
    audienceCount: recipients.length,
    skippedByReason,
    recipientsCount,
    smsParts,
    smsCredits: smsParts * recipientsCount,
    costPoisha: 0,
  };
}
