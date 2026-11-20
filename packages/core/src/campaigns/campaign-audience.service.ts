import { Inject, Injectable } from '@nestjs/common';

import { MessagingService } from '../messaging/messaging.service';
import { HOUR_MS } from '../platform/time';
import { SegmentsService } from '../segments/segments.service';
import {
  AUDIENCE_PAGE_SIZE,
  type AudienceDecision,
  SendPolicyService,
} from '../sending/send-policy.service';
import type { ApprovalCursor } from './campaign-approval.repository';
import type { Campaign, FrozenRecipient } from './campaigns.repository';

// D24. Meta's window is 24 hours; the extra hour covers the time between our check and Meta
// accepting the message.
export const MESSENGER_CAMPAIGN_WINDOW_MS = 23 * HOUR_MS;

// A Messenger audience is judged as of one moment, so its windows and the send time agree.
export function audienceDecisionTime(
  campaign: Pick<Campaign, 'channel' | 'scheduledFor'>,
  approvedAt: Date,
): Date {
  return campaign.channel === 'messenger' ? approvedAt : (campaign.scheduledFor ?? approvedAt);
}

export type AudiencePage = {
  recipients: FrozenRecipient[];
  // Contacts read from the include segment, before exclusions.
  checked: number;
  next: ApprovalCursor;
  isLast: boolean;
};

// One page of the campaign's audience: the contacts of the include segment at the cursor, less
// the exclude segments, each with the send check's verdict.
@Injectable()
export class CampaignAudienceService {
  constructor(
    @Inject(SegmentsService) private readonly segments: SegmentsService,
    @Inject(SendPolicyService) private readonly sendPolicy: SendPolicyService,
    @Inject(MessagingService) private readonly messaging: MessagingService,
  ) {}

  // A missing segment id fails here with SEGMENT_NOT_FOUND.
  async page(
    storeId: string,
    campaign: Pick<
      Campaign,
      'channel' | 'channelConnectionId' | 'includeSegmentIds' | 'excludeSegmentIds'
    >,
    cursor: ApprovalCursor,
    at: Date,
  ): Promise<AudiencePage> {
    const contactIds = await this.segments.contactIds(
      storeId,
      campaign.includeSegmentIds[cursor.segmentIndex]!,
      { cursor: cursor.contactId ?? undefined, limit: AUDIENCE_PAGE_SIZE },
    );
    const excluded = new Set<string>();
    if (contactIds.length)
      for (const segmentId of campaign.excludeSegmentIds)
        for (const contactId of await this.segments.matchingContactIds(
          storeId,
          segmentId,
          contactIds,
        ))
          excluded.add(contactId);
    const audience = contactIds.filter((contactId) => !excluded.has(contactId));
    // A campaign with a Page goes to Page-scoped identities, and only while their window is open.
    const page =
      campaign.channelConnectionId && audience.length
        ? await this.messaging.pageAudience(storeId, campaign.channelConnectionId, audience)
        : undefined;
    const windowClosesAtOf = new Map(
      [...(page ?? [])].flatMap(([contactId, { lastInboundAt }]) =>
        lastInboundAt
          ? [[contactId, new Date(lastInboundAt.getTime() + MESSENGER_CAMPAIGN_WINDOW_MS)] as const]
          : [],
      ),
    );
    const decisions = audience.length
      ? await this.sendPolicy.checkAudience(storeId, {
          contactIds: audience,
          channel: campaign.channel,
          category: 'marketing',
          at,
          windowClosesAtOf,
        })
      : [];
    const isEndOfSegment = contactIds.length < AUDIENCE_PAGE_SIZE;
    const next = isEndOfSegment
      ? { segmentIndex: cursor.segmentIndex + 1, contactId: null }
      : { segmentIndex: cursor.segmentIndex, contactId: contactIds.at(-1)! };
    return {
      recipients: decisions.map((decision) =>
        toFrozenRecipient(decision, page?.get(decision.contactId), page !== undefined),
      ),
      checked: contactIds.length,
      next,
      isLast: next.segmentIndex >= campaign.includeSegmentIds.length,
    };
  }
}

// A quiet-hours defer is queued: the sender waits for the allowed time. A contact with no
// identity on the Page has no chat there, which the window check reports first; say what is wrong.
function toFrozenRecipient(
  { contactId, phone, decision }: AudienceDecision,
  identity: { identityId: string; address: string } | undefined,
  onPage: boolean,
): FrozenRecipient {
  const route = onPage
    ? {
        contactIdentityId: identity?.identityId ?? null,
        destinationAddress: identity?.address ?? null,
      }
    : { destinationAddress: phone };
  if (decision.action !== 'skip')
    return { contactId, ...route, status: 'queued', skipReason: null };
  const noAddress = onPage && !identity && decision.reason === 'window_closed';
  return {
    contactId,
    ...route,
    status: 'skipped',
    skipReason: noAddress ? 'no_address' : decision.reason,
  };
}
