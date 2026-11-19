import { describe, expect, it } from 'vitest';

import { campaignListQuerySchema, changeCampaignSchema, createCampaignSchema } from './campaigns';

describe('campaign draft schemas', () => {
  it('accepts only SMS until Messenger content arrives', () => {
    expect(createCampaignSchema.safeParse({ name: 'ঈদ', channel: 'messenger' }).success).toBe(
      false,
    );
    expect(createCampaignSchema.parse({ name: 'ঈদ', channel: 'sms' })).toMatchObject({
      content: { text: '' },
      scheduledFor: null,
    });
  });

  it('leaves out of a change every field not sent, so a save never resets one', () => {
    expect(changeCampaignSchema.parse({ name: 'শীতের অফার' })).toEqual({ name: 'শীতের অফার' });
    expect(changeCampaignSchema.safeParse({}).success).toBe(false);
  });

  it('refuses the same segment twice', () => {
    const id = '0195f8a2-5b1e-7c3d-9e4f-1a2b3c4d5e6f';
    expect(changeCampaignSchema.safeParse({ includeSegmentIds: [id, id] }).success).toBe(false);
  });
});

describe('campaign list query', () => {
  it('accepts bounded filters with the default page size', () => {
    expect(
      campaignListQuerySchema.parse({
        search: ' ঈদের অফার ',
        status: 'scheduled',
        channel: 'sms',
        createdFrom: '2026-11-01',
        createdThrough: '2026-11-30',
      }),
    ).toEqual({
      search: 'ঈদের অফার',
      status: 'scheduled',
      channel: 'sms',
      createdFrom: '2026-11-01',
      createdThrough: '2026-11-30',
      limit: 50,
    });
  });

  it.each([
    { search: ' '.repeat(3) },
    { search: 'x'.repeat(101) },
    { search: 'before\u0000after' },
    { status: 'unknown' },
    { channel: 'email' },
    { createdThrough: '2026-02-30' },
    { createdFrom: '0000-01-01' },
    { createdThrough: '2026-11-20T00:00:00Z' },
    { createdFrom: '2026-11-20', createdThrough: '2026-11-19' },
  ])('rejects an invalid filter %o', (query) => {
    expect(campaignListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts second- and millisecond-precision date boundaries', () => {
    expect(
      campaignListQuerySchema.safeParse({
        createdFrom: '2026-11-20',
        createdThrough: '2026-11-20',
      }).success,
    ).toBe(true);
  });
});
