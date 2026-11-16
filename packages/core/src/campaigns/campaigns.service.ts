import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CampaignEstimateResponse,
  CampaignListQuery,
  CampaignListResponse,
  CampaignResponse,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';
import { countSmsParts } from '@dakly/contracts/sms';
import type { StoreAccess } from '@dakly/contracts/team';

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
import { campaignError } from './campaigns.errors';
import { type Campaign, CampaignsRepository, type FrozenRecipient } from './campaigns.repository';

// Writes take the actor (services.md); nothing records it for drafts yet.
type Actor = AuditEntry['actor'];

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
    if (!campaign) throw await this.notDraftError(storeId, campaignId);
    return toCampaignResponse(campaign);
  }

  async removeDraft(storeId: string, campaignId: string, _actor: Actor): Promise<void> {
    if (!(await this.repository.removeDraft(storeId, campaignId)))
      throw await this.notDraftError(storeId, campaignId);
  }

  async estimate(storeId: string, campaignId: string): Promise<CampaignEstimateResponse> {
    const campaign = await this.find(storeId, campaignId);
    if (campaign.status !== 'draft') throw campaignError('CAMPAIGN_NOT_DRAFT');
    return toEstimate(campaign, await this.checkAudience(storeId, campaign));
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
      if (!campaign) throw await this.notDraftError(storeId, campaignId);
      if (!campaign.content.text) throw campaignError('CAMPAIGN_TEXT_EMPTY');
      if (campaign.scheduledFor && campaign.scheduledFor <= this.clock.now())
        throw campaignError('CAMPAIGN_SEND_TIME_PASSED');
      const recipients = await this.checkAudience(storeId, campaign);
      const estimate = toEstimate(campaign, recipients);
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
        idempotencyKey: `campaign-approval:${campaignId}`,
        actor: approver.actor,
      });
      return toCampaignResponse(
        await this.markApproved(storeId, campaign, estimate, approver.actor),
      );
    });
  }

  private async markApproved(
    storeId: string,
    campaign: Campaign,
    estimate: CampaignEstimateResponse,
    actor: Actor,
  ): Promise<Campaign> {
    const now = this.clock.now();
    const status = campaign.scheduledFor ? 'scheduled' : 'sending';
    const approved = await this.repository.markApproved(storeId, campaign.id, {
      status,
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

  // The guarded write found no draft: say whether the campaign is missing or past draft.
  private async notDraftError(storeId: string, campaignId: string) {
    await this.find(storeId, campaignId);
    return campaignError('CAMPAIGN_NOT_DRAFT');
  }
}

function toEstimate(campaign: Campaign, recipients: FrozenRecipient[]): CampaignEstimateResponse {
  const skippedByReason: CampaignEstimateResponse['skippedByReason'] = {};
  for (const { skipReason } of recipients)
    if (skipReason) skippedByReason[skipReason] = (skippedByReason[skipReason] ?? 0) + 1;
  const recipientsCount = recipients.filter((recipient) => recipient.status === 'queued').length;
  const smsParts = campaign.content.text ? countSmsParts(campaign.content.text) : 0;
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
