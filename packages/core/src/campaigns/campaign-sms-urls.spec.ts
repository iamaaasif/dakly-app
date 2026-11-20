import { describe, expect, it, vi } from 'vitest';

import { campaignSmsUrls, replaceCampaignSmsUrls } from './campaign-sms-urls';

describe('SMS campaign body URLs', () => {
  it('leaves sentence punctuation outside links and keeps balanced URL punctuation', () => {
    const text = 'See (https://shop.example.test/item(foo)), then https://shop.example.test/শাড়ি।';
    const urls = campaignSmsUrls(text);

    expect(urls.map(({ target }) => target)).toEqual([
      'https://shop.example.test/item(foo)',
      new URL('https://shop.example.test/শাড়ি').href,
    ]);
    expect(replaceCampaignSmsUrls(text, urls, (index) => `/short${index}`)).toBe(
      'See (/short0), then /short1।',
    );
  });

  it('keeps repeated destinations in order and ignores malformed and unsupported candidates', () => {
    const text =
      'mailto:test@example.test xhttps://ignore.test https:// HEAD HTTPS://shop.example.test/?v=1#part https://shop.example.test/?v=1#part';
    const urls = campaignSmsUrls(text);

    expect(urls.map(({ target }) => target)).toEqual([
      'https://shop.example.test/?v=1#part',
      'https://shop.example.test/?v=1#part',
    ]);
    expect(replaceCampaignSmsUrls(text, urls, (index) => `/short${index}`)).toBe(
      'mailto:test@example.test xhttps://ignore.test https:// HEAD /short0 /short1',
    );
  });

  it('preserves text without URLs', () => {
    const text = 'নতুন শাড়ি এসেছে';
    const replace = vi.fn();
    const urls = campaignSmsUrls(text);

    expect(urls).toEqual([]);
    expect(replaceCampaignSmsUrls(text, urls, replace)).toBe(text);
    expect(replace).not.toHaveBeenCalled();
  });

  it('preserves punctuation inside an explicitly bracketed URL', () => {
    const text = 'Open <https://shop.example.test/?coupon=value!>.';
    const urls = campaignSmsUrls(text);
    expect(urls.map(({ target }) => target)).toEqual(['https://shop.example.test/?coupon=value!']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('Open </short>.');
  });
});
