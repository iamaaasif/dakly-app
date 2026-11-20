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

  it('wraps an explicitly bracketed URL with an apostrophe in its query', () => {
    const target = "https://shop.example.test/search?q=O'Reilly";
    const text = `Open <${target}>.`;
    const urls = campaignSmsUrls(text);

    expect(urls.map((url) => url.target)).toEqual([new URL(target).href]);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('Open </short>.');
  });

  it('leaves sentence punctuation inside an outer parenthetical', () => {
    const text = 'See (https://shop.example.test/a.)';
    const urls = campaignSmsUrls(text);

    expect(urls.map((url) => url.target)).toEqual(['https://shop.example.test/a']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('See (/short.)');
  });

  it.each([
    {
      text: "Visit https://shop.example.test/search?q=O'Reilly",
      target: "https://shop.example.test/search?q=O'Reilly",
      body: 'Visit /short',
    },
    {
      text: 'Visit ‘https://shop.example.test/O’Reilly’, then browse.',
      target: 'https://shop.example.test/O’Reilly',
      body: 'Visit ‘/short’, then browse.',
    },
    {
      text: 'Visit "https://shop.example.test/search?q=a"b".',
      target: 'https://shop.example.test/search?q=a"b',
      body: 'Visit "/short".',
    },
    {
      text: 'Visit "https://shop.example.test/search?q=O\'\'Reilly".',
      target: "https://shop.example.test/search?q=O''Reilly",
      body: 'Visit "/short".',
    },
    {
      text: 'Visit "https://shop.example.test/search?q=a"&\'b=1".',
      target: 'https://shop.example.test/search?q=a"&\'b=1',
      body: 'Visit "/short".',
    },
  ])(
    'keeps internal quote characters and any surrounding quotes in $text',
    ({ text, target, body }) => {
      const urls = campaignSmsUrls(text);

      expect(urls.map((url) => url.target)).toEqual([new URL(target).href]);
      expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe(body);
    },
  );

  it.each([
    { prefix: '"', value: '{"tags":["new"]}', suffix: '".' },
    { prefix: '("', value: '{"tags":["new"]}', suffix: '").' },
    { prefix: '("', value: '["red","blue"]', suffix: '").' },
  ])('keeps JSON quotes and brackets in a URL with $value', ({ prefix, value, suffix }) => {
    const target = `https://shop.example.test/search?filter=${value}`;
    const text = `Open ${prefix}${target}${suffix}`;
    const urls = campaignSmsUrls(text);

    expect(urls.map((url) => url.target)).toEqual([new URL(target).href]);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe(
      `Open ${prefix}/short${suffix}`,
    );
  });

  it('does not wrap a partial destination before a backslash', () => {
    const text = String.raw`Visit https://shop.example.test/a\b`;
    const urls = campaignSmsUrls(text);

    expect(urls).toEqual([]);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe(text);
  });

  it('keeps nested URLs inside unsupported URI tokens and wraps standalone URLs', () => {
    const unsupported =
      'Open myapp://open?target=https://shop.example.test/product or //shop.example.test/?return=https://other.example.test/a';
    const text = `${unsupported} (<https://shop.example.test/offer>).`;
    const urls = campaignSmsUrls(text);

    expect(urls.map((url) => url.target)).toEqual(['https://shop.example.test/offer']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe(`${unsupported} (</short>).`);
  });

  it('leaves malformed schemes and unpaired angle delimiters untouched', () => {
    const text =
      'Open https:///shop.example.test/a or https://shop.example.test/a<extra>. Or <https://shop.example.test/a!';
    expect(campaignSmsUrls(text)).toEqual([]);
  });

  it('leaves angle-bracket candidates connected to another token untouched', () => {
    const text =
      'Open <https://shop.example.test/a>extra. Or <https://shop.example.test/a><https://other.example.test/b>.';
    expect(campaignSmsUrls(text)).toEqual([]);
  });

  it('leaves quoted candidates without a closing quote boundary untouched', () => {
    const text = 'Open "https://shop.example.test/a"today. Or ‘https://shop.example.test/b.';
    expect(campaignSmsUrls(text)).toEqual([]);
  });

  it.each([
    'Open “https://shop.example.test”—“today”.',
    'Open “https://shop.example.test/a”today”.',
    'Open ‘https://shop.example.test/O’Reilly’—‘today’.',
    'Open "https://shop.example.test/?item=1"—"today".',
    'Open “‘https://shop.example.test/a’”—“‘today’”.',
    'Open ("https://shop.example.test/?item=1")—("today").',
    'Open (‘https://shop.example.test/a’)—(‘today’).',
    'Open [(‘"https://shop.example.test/?item=1"’)]—[(‘"today"’)].',
    'Open (https://shop.example.test/?item=1)—(today).',
    'Open ("https://shop.example.test/?item=1"—"today").',
    'Open [(‘"https://shop.example.test/?item=1"—"today"’)].',
    'Open "https://shop.example.test/?item=1"—("today").',
    'Open (https://shop.example.test/?q=left[)—(today).',
    'Open (["https://shop.example.test/?item=1"]—"today").',
  ])('keeps adjacent quoted prose out of the URL in %s', (text) => {
    expect(campaignSmsUrls(text)).toEqual([]);
  });

  it.each([
    { prefix: '(', target: 'https://shop.example.test/a(foo)-(bar)', suffix: ').' },
    { prefix: '[', target: 'https://shop.example.test/search?filter=[[1],[2]]', suffix: '].' },
  ])('keeps balanced URL brackets with the outer $prefix wrapper', ({ prefix, target, suffix }) => {
    const text = `Open ${prefix}${target}${suffix}`;
    const urls = campaignSmsUrls(text);

    expect(urls.map((url) => url.target)).toEqual([new URL(target).href]);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe(
      `Open ${prefix}/short${suffix}`,
    );
  });

  it('keeps every surrounding bracket when a URL is nested in angle brackets', () => {
    const text = 'Open <<https://shop.example.test/offer>>.';
    const urls = campaignSmsUrls(text);

    expect(urls.map((url) => url.target)).toEqual(['https://shop.example.test/offer']);
    expect(replaceCampaignSmsUrls(text, urls, () => '/short')).toBe('Open <</short>>.');
  });
});
