import { Inject, Injectable } from '@nestjs/common';

import { countSmsParts } from '@dakly/contracts/sms';

import { LinksService, type NewTrackedLink } from '../links/links.service';
import type { ClaimableRecipient } from './campaign-sending.repository';
import { campaignSmsUrls, replaceCampaignSmsUrls } from './campaign-sms-urls';
import type { LockedCampaign } from './campaigns.repository';

const ACTOR = { kind: 'system' } as const;
type SmsCampaign = Pick<LockedCampaign, 'id' | 'content' | 'shortLinkBase'>;
type RecipientCodes = Pick<
  ClaimableRecipient,
  'contactId' | 'optOutLinkCode' | 'redirectLinkCodes'
>;

@Injectable()
export class CampaignSmsService {
  constructor(@Inject(LinksService) private readonly links: LinksService) {}

  estimate(text: string, base = this.links.shortLinkBase()) {
    if (!text) return { shortLinkBase: base, smsParts: 0 };
    const content = replaceCampaignSmsUrls(text, campaignSmsUrls(text), () =>
      this.links.sampleRedirectUrl(base),
    );
    return {
      shortLinkBase: base,
      smsParts: countSmsParts(withOptOut(content, this.links.sampleOptOutUrl(base))),
    };
  }

  // What one customer would see, with sample link codes: no tracked link is created for a test.
  sampleBody(text: string): string {
    const base = this.links.shortLinkBase();
    const content = replaceCampaignSmsUrls(text, campaignSmsUrls(text), () =>
      this.links.sampleRedirectUrl(base),
    );
    return withOptOut(content, this.links.sampleOptOutUrl(base));
  }

  async prepare(storeId: string, campaign: SmsCampaign, recipient: RecipientCodes) {
    const { text } = campaign.content;
    const base = campaign.shortLinkBase ?? this.links.shortLinkBase();
    const urls = campaignSmsUrls(text);
    const { optOutLinkCode, redirectLinkCodes, createdLinks } = await this.prepareCodes(
      storeId,
      campaign.id,
      recipient,
      urls.map(({ target }) => target),
    );
    const content = replaceCampaignSmsUrls(text, urls, (index) =>
      this.links.redirectUrl(redirectLinkCodes[index]!, base),
    );
    return {
      body: withOptOut(content, this.links.optOutUrl(optOutLinkCode, base)),
      optOutLinkCode,
      redirectLinkCodes,
      createdLinks,
    };
  }

  private async prepareCodes(
    storeId: string,
    campaignId: string,
    recipient: RecipientCodes,
    targets: string[],
  ) {
    const source = {
      sourceType: 'campaign',
      sourceId: campaignId,
      contactId: recipient.contactId,
    } as const;
    const pending: NewTrackedLink[] = [];
    if (!recipient.optOutLinkCode) pending.push({ ...source, kind: 'sms_opt_out' });
    if (recipient.redirectLinkCodes === null) {
      for (const targetUrl of targets) pending.push({ ...source, kind: 'redirect', targetUrl });
    }

    const created = pending.length ? await this.links.create(storeId, pending, ACTOR) : [];
    const optOutLinkCode = recipient.optOutLinkCode ?? created.shift()!.code;
    const redirectLinkCodes = recipient.redirectLinkCodes ?? created.map(({ code }) => code);
    return { optOutLinkCode, redirectLinkCodes, createdLinks: pending.length > 0 };
  }
}

function withOptOut(text: string, optOutUrl: string): string {
  return `${text}\n${optOutUrl}`;
}
