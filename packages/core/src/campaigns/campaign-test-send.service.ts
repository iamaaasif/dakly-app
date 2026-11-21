import { Inject, Injectable } from '@nestjs/common';

import { UsersService } from '../auth/users.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { SmsService } from '../sms/sms.service';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { CampaignSmsService } from './campaign-sms.service';
import { campaignError } from './campaigns.errors';
import { CampaignsRepository } from './campaigns.repository';

// Each test is a real SMS that Dakly pays for, so a shop gets a few an hour.
const TESTS_PER_HOUR = 5;

@Injectable()
export class CampaignTestSendService {
  constructor(
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(CampaignSmsService) private readonly sms: CampaignSmsService,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Inject(SmsSendersService) private readonly senders: SmsSendersService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  // Goes only to the member's own verified phone, so a test cannot reach a customer. It takes no
  // credits, creates no tracked link and leaves no message row, so results never count it.
  async send(storeId: string, campaignId: string, userId: string): Promise<void> {
    const campaign = await this.campaigns.find(storeId, campaignId);
    if (!campaign) throw campaignError('CAMPAIGN_NOT_FOUND');
    if (campaign.channel !== 'sms') throw campaignError('CAMPAIGN_TEST_SMS_ONLY');
    if (campaign.status !== 'draft') throw campaignError('CAMPAIGN_NOT_DRAFT');
    if (!campaign.content.text) throw campaignError('CAMPAIGN_TEXT_EMPTY');
    const member = await this.users.profile(userId);
    if (!member.phone || !member.isPhoneVerified)
      throw campaignError('CAMPAIGN_TEST_PHONE_REQUIRED');
    const limit = await this.limiter.consume(`campaign-test:${storeId}`, TESTS_PER_HOUR, 3600);
    if (!limit.allowed) throw campaignError('CAMPAIGN_TEST_RATE_LIMITED');
    await this.smsService.send({
      to: member.phone,
      text: `Test: ${this.sms.sampleBody(campaign.content.text)}`,
      sender: await this.senders.approvedSenderName(storeId),
    });
  }
}
