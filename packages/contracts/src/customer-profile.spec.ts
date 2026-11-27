import { describe, expect, it } from 'vitest';

import {
  addCustomerNoteSchema,
  customerProfilePageQuerySchema,
  marketingConsentChannelSchema,
  setMarketingConsentSchema,
} from './customer-profile';

describe('customer profile contract', () => {
  it('takes a cursor made of a time and a key, and nothing else', () => {
    const cursor = '2026-11-09T09:00:00.123456Z|order_placed:018f0bd8-1234-7123-8123-123456789abc';
    expect(customerProfilePageQuerySchema.parse({ cursor }).cursor).toBe(cursor);
    expect(customerProfilePageQuerySchema.safeParse({ cursor: "x'; drop table" }).success).toBe(
      false,
    );
    expect(customerProfilePageQuerySchema.parse({}).limit).toBe(20);
    expect(customerProfilePageQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });

  it('trims a note and refuses an empty one', () => {
    expect(addCustomerNoteSchema.parse({ body: '  বড় সাইজ  ' }).body).toBe('বড় সাইজ');
    expect(addCustomerNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('lets staff switch only WhatsApp and SMS', () => {
    expect(marketingConsentChannelSchema.safeParse('sms').success).toBe(true);
    for (const channel of ['email', 'messenger', 'instagram'])
      expect(marketingConsentChannelSchema.safeParse(channel).success).toBe(false);
    expect(setMarketingConsentSchema.safeParse({ subscribed: 'yes' }).success).toBe(false);
  });
});
