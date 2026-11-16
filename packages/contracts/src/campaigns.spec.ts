import { describe, expect, it } from 'vitest';

import { changeCampaignSchema, createCampaignSchema } from './campaigns';

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
