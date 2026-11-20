import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { CampaignResponse } from '@dakly/contracts/campaigns';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { toCampaignResponse } from './campaign-response';
import { campaignError } from './campaigns.errors';
import { CampaignsRepository } from './campaigns.repository';

const COPY_PREFIX = 'Copy of ';
const MAX_NAME_LENGTH = 100;

@Injectable()
export class CampaignDuplicateService {
  constructor(
    @Inject(CampaignsRepository) private readonly repository: CampaignsRepository,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
  ) {}

  // A new draft with the same message and audience; nothing about sending carries over.
  async duplicate(
    storeId: string,
    campaignId: string,
    actor: AuditEntry['actor'],
  ): Promise<CampaignResponse> {
    const source = await this.repository.find(storeId, campaignId);
    if (!source) throw campaignError('CAMPAIGN_NOT_FOUND');
    if (source.channelConnectionId)
      await this.channels.requireFacebookPage(storeId, source.channelConnectionId);
    const copy = await this.repository.insert(storeId, {
      name: `${COPY_PREFIX}${source.name}`.slice(0, MAX_NAME_LENGTH),
      goal: source.goal,
      channel: source.channel,
      channelConnectionId: source.channelConnectionId,
      content: source.content,
      includeSegmentIds: source.includeSegmentIds,
      excludeSegmentIds: source.excludeSegmentIds,
      scheduledFor: null,
      createdByUserId: actor.kind === 'user' ? actor.userId : null,
    });
    return toCampaignResponse(copy);
  }
}
