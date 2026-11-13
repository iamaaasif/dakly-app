import { describe, expect, it } from 'vitest';
import * as social from './social';
import * as campaigns from './campaigns';

const connectionId = '018f0bd8-1234-7123-8123-123456789abc';
const identityId = '018f0bd8-1234-7123-8123-123456789abd';

describe('saved content and target captions', () => {
  it('round trips saved Bangla SMS text with author and AI provenance', () => {
    expect(social).toHaveProperty('savedContentSchema');
    const input = {
      kind: 'sms',
      language: 'bn',
      body: 'নতুন শাড়ি এসেছে',
      createdByUserId: identityId,
      isAiWritten: true,
      aiRunId: connectionId,
    };
    expect(social.savedContentSchema.parse(input)).toEqual(input);
  });

  it('keeps distinct network wording and distinguishes empty overrides from fallback', () => {
    expect(social).toHaveProperty('postTargetCaptionSchema');
    expect(
      social.postTargetCaptionSchema.parse({
        channelConnectionId: connectionId,
        captionOverride: 'Facebook wording',
      }).captionOverride,
    ).toBe('Facebook wording');
    expect(
      social.postTargetCaptionSchema.parse({ channelConnectionId: identityId, captionOverride: '' })
        .captionOverride,
    ).toBe('');
    expect(
      social.postTargetCaptionSchema.parse({
        channelConnectionId: identityId,
        captionOverride: null,
      }).captionOverride,
    ).toBeNull();
  });
});

describe('campaign routing', () => {
  it('requires a connection and identity for Messenger addresses scoped to a Page', () => {
    expect(campaigns).toHaveProperty('campaignRecipientRouteSchema');
    const input = {
      channel: 'messenger',
      channelConnectionId: connectionId,
      contactIdentityId: identityId,
      destinationAddress: 'page-scoped-address',
    };
    expect(campaigns.campaignRecipientRouteSchema.parse(input)).toEqual(input);
    expect(
      campaigns.campaignRecipientRouteSchema.safeParse({ ...input, channelConnectionId: null })
        .success,
    ).toBe(false);
    expect(
      campaigns.campaignRecipientRouteSchema.safeParse({ ...input, contactIdentityId: null })
        .success,
    ).toBe(false);
  });

  it('accepts SMS with a phone but no channel connection or identity', () => {
    expect(campaigns).toHaveProperty('campaignRecipientRouteSchema');
    const input = {
      channel: 'sms',
      channelConnectionId: null,
      contactIdentityId: null,
      destinationAddress: '01712345678',
    };
    expect(campaigns.campaignRecipientRouteSchema.parse(input)).toEqual(input);
    expect(
      campaigns.campaignRecipientRouteSchema.safeParse({
        ...input,
        channelConnectionId: connectionId,
      }).success,
    ).toBe(false);
  });
});
