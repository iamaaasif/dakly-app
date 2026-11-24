import { Inject, Injectable } from '@nestjs/common';

import type { AdLinkSource, AdList, AdListItem, AdStatus } from '@dakly/contracts/ad-links';

import { ProductsService } from '../products/products.service';
import { adLinkError } from './ad-links.errors';
import { AdLinksRepository } from './ad-links.repository';
import { AdLinksService } from './ad-links.service';
import { AdSourcesRepository } from './ad-sources.repository';

type Key = { source: AdLinkSource; externalId: string };
type KeyedProduct = Key & { productId: string };

const listLimit = 100;

function adStatus(linked: number, suggested: number): AdStatus {
  if (linked) return 'confirmed';
  return suggested ? 'suggested' : 'unlinked';
}

@Injectable()
export class AdListService {
  constructor(
    @Inject(AdSourcesRepository) private readonly sources: AdSourcesRepository,
    @Inject(AdLinksRepository) private readonly linkRows: AdLinksRepository,
    @Inject(AdLinksService) private readonly links: AdLinksService,
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}

  async list(storeId: string): Promise<AdList> {
    const [ads, linked, suggested] = await Promise.all([
      this.sources.list(storeId, listLimit),
      this.linkRows.listAll(storeId),
      this.sources.listAllSuggestions(storeId),
    ]);
    const named = new Map(
      (
        await this.products.getManyForChat(storeId, [
          ...new Set([...linked, ...suggested].map(({ productId }) => productId)),
        ])
      ).map(({ id, name }) => [id, { productId: id, name }]),
    );
    const pick = (rows: KeyedProduct[], ad: Key) =>
      rows
        .filter((row) => row.source === ad.source && row.externalId === ad.externalId)
        .flatMap(({ productId }) => named.get(productId) ?? []);
    return {
      items: ads.map((ad): AdListItem => {
        const products = pick(linked, ad);
        const suggestions = pick(suggested, ad);
        const status = adStatus(products.length, suggestions.length);
        return { ...ad, status, products, suggestions, lastSeenAt: ad.lastSeenAt.toISOString() };
      }),
    };
  }

  // One tap: the suggestions become the link, so replies use them from now on.
  async confirm(storeId: string, key: Key) {
    const ids = await this.sources.listSuggestedProductIds(storeId, key);
    if (!ids.length) throw adLinkError('AD_SUGGESTION_NOT_FOUND');
    return this.links.replace(storeId, key, ids);
  }

  async dismiss(storeId: string, key: Key): Promise<void> {
    if (!(await this.sources.clearSuggestions(storeId, key)))
      throw adLinkError('AD_SUGGESTION_NOT_FOUND');
  }
}
