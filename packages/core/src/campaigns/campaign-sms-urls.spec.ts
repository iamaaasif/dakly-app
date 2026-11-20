import { describe, expect, it } from 'vitest';

import { campaignSmsUrls, replaceCampaignSmsUrls } from './campaign-sms-urls';

describe('SMS campaign body URLs', () => {
  it('wraps a plain link at the start of the message', () => {
    const text = 'https://shop.example.test/offer is on sale';
    const urls = campaignSmsUrls(text);

    expect(urls.map(({ target }) => target)).toEqual(['https://shop.example.test/offer']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('/short is on sale');
  });

  it('keeps sentence punctuation after a link', () => {
    const text = 'Open https://shop.example.test/offer।';
    const urls = campaignSmsUrls(text);

    expect(urls.map(({ target }) => target)).toEqual(['https://shop.example.test/offer']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('Open /short।');
  });

  it('preserves message brackets and matched brackets inside the URL', () => {
    const text = 'Open (https://shop.example.test/item(foo))).';
    const urls = campaignSmsUrls(text);

    expect(urls.map(({ target }) => target)).toEqual(['https://shop.example.test/item(foo)']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('Open (/short)).');
  });

  it('wraps two links in order', () => {
    const text = 'See https://shop.example.test/sale and [http://shop.example.test/new]';
    const urls = campaignSmsUrls(text);

    expect(urls.map(({ target }) => target)).toEqual([
      'https://shop.example.test/sale',
      'http://shop.example.test/new',
    ]);
    expect(replaceCampaignSmsUrls(text, urls, (index) => `/short${index}`)).toBe(
      'See /short0 and [/short1]',
    );
  });

  it('leaves invalid URLs and text outside the link rule as written', () => {
    const text = 'Invalid https://[bad] and quoted "https://shop.example.test/offer".';
    const urls = campaignSmsUrls(text);

    expect(urls).toEqual([]);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe(text);
  });
});
