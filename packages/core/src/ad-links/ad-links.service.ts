import { Inject, Injectable } from '@nestjs/common';

import type { AdLink, AdLinkSource } from '@dakly/contracts/ad-links';

import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductsService } from '../products/products.service';
import { adLinkError } from './ad-links.errors';
import { AdLinksRepository } from './ad-links.repository';

type Key = { source: AdLinkSource; externalId: string };
export type ChatReferral = { adId: string | null; postId: string | null };

@Injectable()
export class AdLinksService {
  constructor(
    @Inject(AdLinksRepository) private readonly repository: AdLinksRepository,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async get(storeId: string, key: Key): Promise<AdLink> {
    const link = await this.read(storeId, key);
    if (!link.products.length) throw adLinkError('AD_LINK_NOT_FOUND');
    return link;
  }

  replace(storeId: string, key: Key, productIds: string[]): Promise<AdLink> {
    return this.transaction.run(storeId, async () => {
      const ids = [...new Set(productIds)];
      // A product the shop does not offer in chats would give the customer a price they cannot order at.
      const offered = await this.products.getManyForChat(storeId, ids);
      if (offered.length !== ids.length) throw adLinkError('AD_LINK_PRODUCT_NOT_FOUND');
      await this.repository.replace(storeId, key, ids);
      return {
        ...key,
        products: offered.map(({ id, name }) => ({ productId: id, name })),
      };
    });
  }

  async remove(storeId: string, key: Key): Promise<void> {
    if (!(await this.repository.remove(storeId, key))) throw adLinkError('AD_LINK_NOT_FOUND');
  }

  // The ad's own products win; a customer who came through a post the ad promotes falls back to it.
  // Nothing is guessed: an ad or post with no link has no products.
  async productIdsFor(storeId: string, referral: ChatReferral): Promise<string[]> {
    if (referral.adId) {
      const ids = await this.repository.listProductIds(storeId, {
        source: 'ad',
        externalId: referral.adId,
      });
      if (ids.length) return ids;
    }
    if (!referral.postId) return [];
    return this.repository.listProductIds(storeId, { source: 'post', externalId: referral.postId });
  }

  private async read(storeId: string, key: Key): Promise<AdLink> {
    const ids = await this.repository.listProductIds(storeId, key);
    const offered = await this.products.getManyForChat(storeId, ids);
    return { ...key, products: offered.map(({ id, name }) => ({ productId: id, name })) };
  }
}
