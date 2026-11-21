import { describe, expect, it } from 'vitest';

import type { SmsMessage } from '@dakly/providers/sms/sms-driver';

import type { UsersService } from '../auth/users.service';
import type { RateLimiter } from '../platform/cache/rate-limiter';
import type { SmsService } from '../sms/sms.service';
import type { SmsSendersService } from '../sms-senders/sms-senders.service';
import type { CampaignSmsService } from './campaign-sms.service';
import { CampaignTestSendService } from './campaign-test-send.service';
import type { Campaign, CampaignsRepository } from './campaigns.repository';

const storeId = '01890000-0000-7000-8000-0000000000a1';
const otherStoreId = '01890000-0000-7000-8000-0000000000b2';
const userId = '01890000-0000-7000-8000-0000000000c3';
const campaignId = '01890000-0000-7000-8000-0000000000d4';

function setup(
  options: {
    campaign?: Partial<Campaign>;
    member?: { phone: string | null; isPhoneVerified: boolean };
  } = {},
) {
  const campaign = {
    id: campaignId,
    channel: 'sms',
    status: 'draft',
    content: { text: 'Winter sale https://shop.example/winter' },
    ...options.campaign,
  } as Campaign;
  const sent: SmsMessage[] = [];
  const counts = new Map<string, number>();
  const service = new CampaignTestSendService(
    {
      find: async (store: string, id: string) =>
        store === storeId && id === campaignId ? campaign : undefined,
    } as unknown as CampaignsRepository,
    { sampleBody: (text: string) => `${text}\nhttps://dak.ly/l/000` } as CampaignSmsService,
    {
      send: async (message: SmsMessage) => {
        sent.push(message);
        return { providerMessageId: 'fake-1' };
      },
    } as unknown as SmsService,
    { approvedSenderName: async () => 'Nusrat Fab' } as unknown as SmsSendersService,
    {
      profile: async () => options.member ?? { phone: '01712345678', isPhoneVerified: true },
    } as unknown as UsersService,
    {
      consume: async (key: string, limit: number) => {
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return { allowed: counts.get(key)! <= limit, retryAfter: 0 };
      },
    } as unknown as RateLimiter,
  );
  return { service, sent };
}

describe('CampaignTestSendService', () => {
  it('sends the saved message with sample links to the member’s own phone', async () => {
    const { service, sent } = setup();
    await service.send(storeId, campaignId, userId);
    expect(sent).toEqual([
      {
        to: '01712345678',
        text: 'Test: Winter sale https://shop.example/winter\nhttps://dak.ly/l/000',
        sender: 'Nusrat Fab',
      },
    ]);
  });

  it('answers not found for a campaign of another shop', async () => {
    const { service, sent } = setup();
    await expect(service.send(otherStoreId, campaignId, userId)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(sent).toEqual([]);
  });

  it.each([
    ['a Messenger campaign', { channel: 'messenger' as const }, 'CAMPAIGN_TEST_SMS_ONLY'],
    [
      'a campaign that is no longer a draft',
      { status: 'scheduled' as const },
      'CAMPAIGN_NOT_DRAFT',
    ],
    ['a campaign without text', { content: { text: '' } }, 'CAMPAIGN_TEXT_EMPTY'],
  ])('refuses %s', async (_name, campaign, code) => {
    const { service, sent } = setup({ campaign });
    await expect(service.send(storeId, campaignId, userId)).rejects.toMatchObject({ code });
    expect(sent).toEqual([]);
  });

  it('refuses a member without a verified phone', async () => {
    const { service, sent } = setup({ member: { phone: '01712345678', isPhoneVerified: false } });
    await expect(service.send(storeId, campaignId, userId)).rejects.toMatchObject({
      code: 'CAMPAIGN_TEST_PHONE_REQUIRED',
    });
    expect(sent).toEqual([]);
  });

  it('allows five tests per shop an hour, then answers rate limited', async () => {
    const { service, sent } = setup();
    for (let count = 0; count < 5; count += 1) await service.send(storeId, campaignId, userId);
    await expect(service.send(storeId, campaignId, userId)).rejects.toMatchObject({
      code: 'CAMPAIGN_TEST_RATE_LIMITED',
      status: 429,
    });
    expect(sent).toHaveLength(5);
  });
});
