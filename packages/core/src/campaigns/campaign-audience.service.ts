import { Inject, Injectable } from '@nestjs/common';

import { SegmentsService } from '../segments/segments.service';
import {
  AUDIENCE_PAGE_SIZE,
  type AudienceDecision,
  SendPolicyService,
} from '../sending/send-policy.service';
import type { ApprovalCursor } from './campaign-approval.repository';
import type { Campaign, FrozenRecipient } from './campaigns.repository';

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
  ) {}

  // A missing segment id fails here with SEGMENT_NOT_FOUND.
  async page(
    storeId: string,
    campaign: Pick<Campaign, 'includeSegmentIds' | 'excludeSegmentIds'>,
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
    const decisions = audience.length
      ? await this.sendPolicy.checkAudience(storeId, {
          contactIds: audience,
          channel: 'sms',
          category: 'marketing',
          at,
        })
      : [];
    const isEndOfSegment = contactIds.length < AUDIENCE_PAGE_SIZE;
    const next = isEndOfSegment
      ? { segmentIndex: cursor.segmentIndex + 1, contactId: null }
      : { segmentIndex: cursor.segmentIndex, contactId: contactIds.at(-1)! };
    return {
      recipients: decisions.map(toFrozenRecipient),
      checked: contactIds.length,
      next,
      isLast: next.segmentIndex >= campaign.includeSegmentIds.length,
    };
  }
}

// A quiet-hours defer is queued: the sender waits for the allowed time.
function toFrozenRecipient({ contactId, phone, decision }: AudienceDecision): FrozenRecipient {
  return decision.action === 'skip'
    ? { contactId, destinationAddress: phone, status: 'skipped', skipReason: decision.reason }
    : { contactId, destinationAddress: phone, status: 'queued', skipReason: null };
}
