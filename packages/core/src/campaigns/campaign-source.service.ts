import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { CampaignResponse, CampaignSourceOutcome } from '@dakly/contracts/campaigns';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { Clock } from '../platform/clock';
import { HOUR_MS } from '../platform/time';
import { toCampaignResponse } from './campaign-response';
import { campaignError } from './campaigns.errors';
import { CampaignsRepository } from './campaigns.repository';

// Staff give people two days to read before asking again (feature 09).
const RESEND_AFTER_MS = 48 * HOUR_MS;
const MAX_NAME_LENGTH = 100;
const NAME_PREFIX = {
  resend_unread: 'Resend of ',
  follow_up_unordered: 'Follow-up to ',
} as const satisfies Record<CampaignSourceOutcome, string>;

// A new draft that sends the same message to people from a finished campaign. Approval then
// runs the usual send check on each of them.
@Injectable()
export class CampaignSourceService {
  constructor(
    @Inject(CampaignsRepository) private readonly repository: CampaignsRepository,
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async createDraft(
    storeId: string,
    campaignId: string,
    outcome: CampaignSourceOutcome,
    actor: AuditEntry['actor'],
  ): Promise<CampaignResponse> {
    const source = await this.repository.find(storeId, campaignId);
    if (!source) throw campaignError('CAMPAIGN_NOT_FOUND');
    if (source.status !== 'sent' || !source.finishedAt)
      throw campaignError('CAMPAIGN_NOT_FINISHED');
    if (outcome === 'resend_unread' && source.channel === 'sms')
      throw campaignError('CAMPAIGN_RESEND_NEEDS_READS');
    if (
      outcome === 'resend_unread' &&
      this.clock.now().getTime() < source.finishedAt.getTime() + RESEND_AFTER_MS
    )
      throw campaignError('CAMPAIGN_RESEND_TOO_EARLY');
    if (source.channelConnectionId)
      await this.channels.requireFacebookPage(storeId, source.channelConnectionId);
    const draft = await this.repository.insert(storeId, {
      name: `${NAME_PREFIX[outcome]}${source.name}`.slice(0, MAX_NAME_LENGTH),
      goal: source.goal,
      channel: source.channel,
      channelConnectionId: source.channelConnectionId,
      content: source.content,
      includeSegmentIds: [],
      excludeSegmentIds: [],
      sourceCampaignId: source.id,
      sourceOutcome: outcome,
      scheduledFor: null,
      createdByUserId: actor.kind === 'user' ? actor.userId : null,
    });
    return toCampaignResponse(draft);
  }
}
