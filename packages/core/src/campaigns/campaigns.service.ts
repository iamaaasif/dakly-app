import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CampaignEstimateResponse,
  CampaignListQuery,
  CampaignListResponse,
  CampaignResponse,
  CampaignStatus,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';
import { countSmsParts } from '@dakly/contracts/sms';
import type { StoreAccess } from '@dakly/contracts/team';

import { LinksService } from '../links/links.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { SegmentsService } from '../segments/segments.service';
import {
  AUDIENCE_PAGE_SIZE,
  type AudienceDecision,
  SendPolicyService,
} from '../sending/send-policy.service';
import { StoresService } from '../stores/stores.service';
import { TeamService } from '../team/team.service';
import { WalletService } from '../wallets/wallet.service';
import { campaignError, type CampaignErrorCode } from './campaigns.errors';
import {
  type Campaign,
  CampaignsRepository,
  type CampaignStatusChange,
  type FrozenRecipient,
} from './campaigns.repository';

// Writes take the actor (services.md); nothing records it for drafts yet.
type Actor = AuditEntry['actor'];

// The changes a member makes by hand (state-machines.md); the sender (CAMP-3) makes the rest.
const STATUS_CHANGES = {
  unschedule: { from: 'scheduled', to: 'draft', refused: 'CAMPAIGN_NOT_SCHEDULED' },
  cancel: { from: 'scheduled', to: 'cancelled', refused: 'CAMPAIGN_NOT_SCHEDULED' },
  pause: { from: 'sending', to: 'paused', refused: 'CAMPAIGN_NOT_SENDING' },
  resume: { from: 'paused', to: 'sending', refused: 'CAMPAIGN_NOT_PAUSED' },
} as const satisfies Record<
  string,
  { from: CampaignStatus; to: CampaignStatus; refused: CampaignErrorCode }
>;
// Approval runs in one request until CAMP-13 makes it a job; this bounds that work.
export const MAX_CAMPAIGN_AUDIENCE = 20_000;
// CAMP-R7: a scheduled campaign can be edited or cancelled until 5 minutes before it sends.
const LAST_CHANGE_BEFORE_SEND_MS = 5 * 60 * 1000;

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(CampaignsRepository) private readonly repository: CampaignsRepository,
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(TeamService) private readonly team: TeamService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(LinksService) private readonly links: LinksService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: CampaignListQuery): Promise<CampaignListResponse> {
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map(toCampaignResponse);
    return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
  }

  async get(storeId: string, campaignId: string): Promise<CampaignResponse> {
    return toCampaignResponse(await this.find(storeId, campaignId));
  }

  async create(
    storeId: string,
    input: CreateCampaignInput,
    actor: Actor,
  ): Promise<CampaignResponse> {
    const campaign = await this.repository.insert(storeId, {
      ...input,
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

  async removeDraft(storeId: string, campaignId: string, _actor: Actor): Promise<void> {
    if (!(await this.repository.removeDraft(storeId, campaignId)))
      throw await this.refusal(storeId, campaignId, 'CAMPAIGN_NOT_DRAFT');
  }

  async estimate(storeId: string, campaignId: string): Promise<CampaignEstimateResponse> {
    const campaign = await this.find(storeId, campaignId);
    if (campaign.status !== 'draft') throw campaignError('CAMPAIGN_NOT_DRAFT');
    return toEstimate(
      campaign,
      await this.checkAudience(storeId, campaign),
      this.links.sampleOptOutUrl(),
    );
  }

  // One store transaction (CAMP-2): the audience is frozen, the credits reserved and the event
  // written together, so a short balance leaves the draft as it was.
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
      const recipients = await this.checkAudience(storeId, campaign);
      const estimate = toEstimate(campaign, recipients, this.links.sampleOptOutUrl());
      if (estimate.recipientsCount === 0) throw campaignError('CAMPAIGN_NO_RECIPIENTS');
      for (let start = 0; start < recipients.length; start += AUDIENCE_PAGE_SIZE)
        await this.repository.insertRecipients(
          storeId,
          campaignId,
          recipients.slice(start, start + AUDIENCE_PAGE_SIZE),
        );
      // After the inserts, so the wallet lock that blocks the store's credit writes is held briefly.
      await this.wallets.reserve(storeId, {
        wallet: 'sms_credits',
        quantity: estimate.smsCredits,
        idempotencyKey: approvalKey(campaignId, now),
        actor: approver.actor,
      });
      return toCampaignResponse(
        await this.markApproved(storeId, campaign, estimate, { actor: approver.actor, now }),
      );
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
        estimatedCostPoisha: null,
        recipientsCount: 0,
        skippedCount: 0,
      });
      await this.releaseCredits(storeId, campaign, actor);
      return draft;
    });
  }

  async cancel(storeId: string, campaignId: string, actor: Actor): Promise<CampaignResponse> {
    return this.transaction.run(storeId, async () => {
      const campaign = await this.lockBeforeSend(storeId, campaignId);
      await this.repository.cancelQueuedRecipients(storeId, campaignId);
      const cancelled = await this.changeStatus(storeId, campaignId, 'cancel');
      await this.releaseCredits(storeId, campaign, actor);
      return cancelled;
    });
  }

  // Only the status moves until the sender (CAMP-3) reads it.
  async pause(storeId: string, campaignId: string, _actor: Actor): Promise<CampaignResponse> {
    return this.changeStatus(storeId, campaignId, 'pause', { pauseReason: 'manual' });
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

  // Last, as in approve, so the wallet lock is held only until commit.
  private async releaseCredits(
    storeId: string,
    campaign: Campaign & { approvedAt: Date | null },
    actor: Actor,
  ): Promise<void> {
    const key = approvalKey(campaign.id, campaign.approvedAt!);
    const reservation = await this.wallets.findByIdempotencyKey(storeId, key);
    await this.wallets.release(storeId, {
      reservationId: reservation!.entryId,
      idempotencyKey: `${key}:release`,
      actor,
    });
  }

  private async changeStatus(
    storeId: string,
    campaignId: string,
    name: keyof typeof STATUS_CHANGES,
    change: Omit<CampaignStatusChange, 'status' | 'updatedAt'> = {},
  ): Promise<CampaignResponse> {
    const { from, to, refused } = STATUS_CHANGES[name];
    const campaign = await this.repository.changeStatus(storeId, campaignId, from, {
      ...change,
      status: to,
      updatedAt: this.clock.now(),
    });
    if (!campaign) throw await this.refusal(storeId, campaignId, refused);
    return toCampaignResponse(campaign);
  }

  private async markApproved(
    storeId: string,
    campaign: Campaign,
    estimate: CampaignEstimateResponse,
    { actor, now }: { actor: Actor; now: Date },
  ): Promise<Campaign> {
    const status = campaign.scheduledFor ? 'scheduled' : 'sending';
    const approved = await this.repository.markApproved(storeId, campaign.id, {
      status,
      startedAt: status === 'sending' ? now : null,
      approvedByUserId: actor.kind === 'user' ? actor.userId : null,
      approvedAt: now,
      updatedAt: now,
      estimatedCostPoisha: estimate.costPoisha,
      recipientsCount: estimate.recipientsCount,
      skippedCount: estimate.audienceCount - estimate.recipientsCount,
    });
    if (!approved) throw campaignError('CAMPAIGN_NOT_DRAFT');
    await this.outbox.publish({
      type: 'campaign.approved',
      storeId,
      occurredAt: now.toISOString(),
      payload: { campaignId: campaign.id, status },
    });
    return approved;
  }

  private async checkAudience(storeId: string, campaign: Campaign): Promise<FrozenRecipient[]> {
    const contactIds = await this.audienceIds(storeId, campaign);
    if (contactIds.length > MAX_CAMPAIGN_AUDIENCE)
      throw campaignError('CAMPAIGN_AUDIENCE_TOO_LARGE');
    const at = campaign.scheduledFor ?? this.clock.now();
    const decisions: AudienceDecision[] = [];
    for (let start = 0; start < contactIds.length; start += AUDIENCE_PAGE_SIZE)
      decisions.push(
        ...(await this.sendPolicy.checkAudience(storeId, {
          contactIds: contactIds.slice(start, start + AUDIENCE_PAGE_SIZE),
          channel: 'sms',
          category: 'marketing',
          at,
        })),
      );
    return decisions.map(toFrozenRecipient);
  }

  private async audienceIds(storeId: string, campaign: Campaign): Promise<string[]> {
    const excluded = new Set(await this.segmentContactIds(storeId, campaign.excludeSegmentIds));
    const included = new Set(await this.segmentContactIds(storeId, campaign.includeSegmentIds));
    return [...included].filter((contactId) => !excluded.has(contactId));
  }

  // A missing segment id fails here with SEGMENT_NOT_FOUND.
  private async segmentContactIds(storeId: string, segmentIds: string[]): Promise<string[]> {
    const contactIds: string[] = [];
    for (const segmentId of segmentIds) {
      let page: string[] = [];
      do {
        page = await this.segments.contactIds(storeId, segmentId, {
          cursor: page.at(-1),
          limit: AUDIENCE_PAGE_SIZE,
        });
        contactIds.push(...page);
      } while (page.length === AUDIENCE_PAGE_SIZE);
    }
    return contactIds;
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
}

// Holds the approval time, so a campaign approved again after an edit reserves anew.
export function approvalKey(campaignId: string, approvedAt: Date): string {
  return `campaign-approval:${campaignId}:${approvedAt.toISOString()}`;
}

// CAMP-R4: every marketing SMS ends with the recipient's opt-out link.
export function marketingSmsText(text: string, optOutUrl: string): string {
  return `${text}\n${optOutUrl}`;
}

// Counts the opt-out link at its real length, so the reservation covers what the sender sends.
function toEstimate(
  campaign: Campaign,
  recipients: FrozenRecipient[],
  optOutUrl: string,
): CampaignEstimateResponse {
  const skippedByReason: CampaignEstimateResponse['skippedByReason'] = {};
  for (const { skipReason } of recipients)
    if (skipReason) skippedByReason[skipReason] = (skippedByReason[skipReason] ?? 0) + 1;
  const recipientsCount = recipients.filter((recipient) => recipient.status === 'queued').length;
  const smsParts = campaign.content.text
    ? countSmsParts(marketingSmsText(campaign.content.text, optOutUrl))
    : 0;
  return {
    audienceCount: recipients.length,
    skippedByReason,
    recipientsCount,
    smsParts,
    smsCredits: smsParts * recipientsCount,
    costPoisha: 0,
  };
}

// A quiet-hours defer is queued: the sender waits for the allowed time.
function toFrozenRecipient({ contactId, phone, decision }: AudienceDecision): FrozenRecipient {
  return decision.action === 'skip'
    ? { contactId, destinationAddress: phone, status: 'skipped', skipReason: decision.reason }
    : { contactId, destinationAddress: phone, status: 'queued', skipReason: null };
}

function toCampaignResponse(campaign: Campaign): CampaignResponse {
  return {
    ...campaign,
    scheduledFor: campaign.scheduledFor?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
