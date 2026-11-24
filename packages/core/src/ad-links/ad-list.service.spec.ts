import { describe, expect, it, vi } from 'vitest';

import { AdListService } from './ad-list.service';

const seen = new Date('2026-11-23T10:00:00Z');
const ads = ['1', '2', '3'].map((n) => ({
  source: 'ad' as const,
  externalId: `12000000000${n}`,
  title: null,
  photoUrl: null,
  lastSeenAt: seen,
}));
const row = (n: string, productId: string) => ({
  source: 'ad' as const,
  externalId: `12000000000${n}`,
  productId,
});

function build(suggestedIds: string[] = ['p2']) {
  const sources = {
    list: vi.fn(async () => ads),
    listAllSuggestions: vi.fn(async () => [row('2', 'p2'), row('1', 'p9')]),
    listSuggestedProductIds: vi.fn(async () => suggestedIds),
    clearSuggestions: vi.fn(async () => false),
  };
  const links = { replace: vi.fn(async () => ({ products: [] })) };
  const service = new AdListService(
    sources as never,
    { listAll: vi.fn(async () => [row('1', 'p1')]) } as never,
    links as never,
    {
      getManyForChat: vi.fn(async () => ['p1', 'p2'].map((id) => ({ id, name: `Product ${id}` }))),
    } as never,
  );
  return { service, links };
}

describe('AdListService', () => {
  it('marks an ad confirmed, suggested or unlinked and hides products the shop no longer offers', async () => {
    const { items } = await build().service.list('store-1');
    expect(items.map(({ status }) => status)).toEqual(['confirmed', 'suggested', 'unlinked']);
    // p9 is not offered in chats any more, so it is not shown as a suggestion.
    expect(items[0]?.suggestions).toEqual([]);
    expect(items[0]?.products).toEqual([{ productId: 'p1', name: 'Product p1' }]);
    expect(items[1]?.suggestions).toEqual([{ productId: 'p2', name: 'Product p2' }]);
  });

  it('turns the suggestions into the link in one call', async () => {
    const { service, links } = build();
    await service.confirm('store-1', { source: 'ad', externalId: '120000000002' });
    expect(links.replace).toHaveBeenCalledWith(
      'store-1',
      { source: 'ad', externalId: '120000000002' },
      ['p2'],
    );
  });

  it('refuses to confirm an ad with no suggestions', async () => {
    const { service, links } = build([]);
    await expect(
      service.confirm('store-1', { source: 'ad', externalId: '120000000003' }),
    ).rejects.toMatchObject({ code: 'AD_SUGGESTION_NOT_FOUND' });
    expect(links.replace).not.toHaveBeenCalled();
  });

  it('refuses to dismiss suggestions that are not there', async () => {
    await expect(
      build().service.dismiss('store-1', { source: 'ad', externalId: '120000000003' }),
    ).rejects.toMatchObject({ code: 'AD_SUGGESTION_NOT_FOUND' });
  });
});
