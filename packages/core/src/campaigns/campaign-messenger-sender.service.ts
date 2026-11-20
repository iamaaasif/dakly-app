import { Inject, Injectable } from '@nestjs/common';

import type { CampaignSendResult } from '../messaging/channel-dispatch.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { AppError } from '../platform/errors/app-error';
import type { SkipReason } from '../sending/send-policy.service';
import { MESSENGER_CAMPAIGN_WINDOW_MS } from './campaign-audience.service';
import { CampaignCountsService } from './campaign-counts.service';
import { CampaignSendingRepository, type ClaimableRecipient } from './campaign-sending.repository';
import type { LockedCampaign } from './campaigns.repository';

export type MessengerPayload = {
  connectionId: string;
  identityId: string;
  imageUrl: string | undefined;
  buttons: { title: string; payload: string }[];
};
export type PageRoute = {
  connectionId: string;
  identityId: string | null;
  address: string | null;
  windowClosesAt: Date | null;
};
type MessengerSubmission = {
  campaignId: string;
  recipient: ClaimableRecipient;
  claimedAt: Date;
  body: string;
  messenger: MessengerPayload;
};

// The Messenger half of the campaign sender: which identity and window a recipient has on the
// Page, and the send itself through the chat transport.
@Injectable()
export class CampaignMessengerSender {
  constructor(
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignCountsService) private readonly counts: CampaignCountsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The route is read again before every send: the identity on the Page must still be the one
  // frozen at approval, and the window is judged now (D24).
  async route(
    storeId: string,
    campaign: LockedCampaign,
    recipient: ClaimableRecipient,
  ): Promise<PageRoute | undefined> {
    if (!campaign.channelConnectionId) return undefined;
    const current = (
      await this.messaging.pageAudience(storeId, campaign.channelConnectionId, [
        recipient.contactId,
      ])
    ).get(recipient.contactId);
    const frozen = current?.identityId === recipient.contactIdentityId ? current : undefined;
    return {
      connectionId: campaign.channelConnectionId,
      identityId: frozen?.identityId ?? null,
      address: frozen?.address ?? null,
      windowClosesAt: frozen?.lastInboundAt
        ? new Date(frozen.lastInboundAt.getTime() + MESSENGER_CAMPAIGN_WINDOW_MS)
        : null,
    };
  }

  // The message is queued and sent in one call, so an uncertain result is final: sending again
  // could show the shopper the image twice. Returns true when the send was refused before
  // reaching Meta and the recipient should be put back.
  async deliver(storeId: string, submission: MessengerSubmission): Promise<boolean> {
    const { campaignId, recipient, body, claimedAt, messenger } = submission;
    const recipientId = recipient.id;
    let result: CampaignSendResult;
    try {
      result = await this.messaging.sendCampaignMessage(storeId, {
        channel: 'messenger',
        contactId: recipient.contactId,
        content: body,
        ...messenger,
        operationKey: `campaign-${recipientId}`,
      });
    } catch (error) {
      if (error instanceof AppError) return true;
      throw error;
    }
    const guard = { status: 'sending', claimedAt } as const;
    if (result.status === 'sent') {
      const providerMessageId = result.externalMessageId;
      await this.repository.changeRecipient(storeId, recipientId, guard, {
        status: 'sending',
        providerMessageId,
      });
      await this.counts.recordAcceptance(storeId, campaignId, {
        recipientId,
        providerMessageId,
        credits: null,
        sentAt: claimedAt,
        errorCode: result.imageRejected ? 'image_rejected' : undefined,
        requireSavedReceipt: false,
      });
      return false;
    }
    await this.counts.recordOutcome(storeId, campaignId, {
      recipientId,
      guard,
      change: {
        status: 'failed',
        errorCode: result.status === 'failed' ? result.errorCode : 'outcome_unknown',
        failedAt: this.clock.now(),
        claimedAt: result.status === 'failed' ? null : undefined,
        smsCredits: null,
      },
    });
    return false;
  }
}

// A recipient with no identity on the Page has no chat there, which the window check reports
// first; say what is wrong.
export function skipReasonFor(reason: SkipReason, page: PageRoute | undefined): SkipReason {
  return page && !page.identityId && reason === 'window_closed' ? 'no_address' : reason;
}

function messengerContent({ content }: LockedCampaign) {
  if (!('buttons' in content)) throw new Error('Messenger campaign without Messenger content');
  return content;
}

// The button payloads name the recipient, so a tap can be matched to the campaign (CAMP-10).
export function messengerBody(campaign: LockedCampaign, recipient: ClaimableRecipient) {
  const { text, imageUrl, buttons } = messengerContent(campaign);
  return {
    body: text,
    optOutLinkCode: null,
    redirectLinkCodes: null,
    createdLinks: false,
    sender: undefined,
    messenger: {
      connectionId: campaign.channelConnectionId!,
      identityId: recipient.contactIdentityId!,
      imageUrl: imageUrl ?? undefined,
      buttons: buttons.map(({ title }, index) => ({
        title,
        payload: `campaign:${recipient.id}:${index}`,
      })),
    },
  };
}
