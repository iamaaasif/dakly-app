import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  CampaignListQuery,
  CampaignListResponse,
  CampaignResponse,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';

import { Clock } from '../platform/clock';
import { campaignError } from './campaigns.errors';
import { type Campaign, CampaignsRepository } from './campaigns.repository';

// Writes take the actor (services.md); nothing records it for drafts yet.
type Actor = AuditEntry['actor'];

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(CampaignsRepository) private readonly repository: CampaignsRepository,
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

function toCampaignResponse(campaign: Campaign): CampaignResponse {
  return {
    ...campaign,
    scheduledFor: campaign.scheduledFor?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
