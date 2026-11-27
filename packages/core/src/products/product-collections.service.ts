import { Inject, Injectable } from '@nestjs/common';

import type { ProductCollectionListResponse } from '@dakly/contracts/product-lists';

import { newId } from '../platform/database/new-id';
import { ProductCollectionsRepository } from './product-collections.repository';

@Injectable()
export class ProductCollectionsService {
  constructor(
    @Inject(ProductCollectionsRepository) private readonly repository: ProductCollectionsRepository,
  ) {}

  async list(storeId: string): Promise<ProductCollectionListResponse> {
    return { items: await this.repository.list(storeId) };
  }

  // Replaces a product's collections, creating the names the shop has not used before.
  async setForProduct(storeId: string, productId: string, names: string[]): Promise<void> {
    const firstSpelling = new Map<string, string>();
    for (const name of names)
      if (!firstSpelling.has(name.toLowerCase())) firstSpelling.set(name.toLowerCase(), name);
    const distinct = [...firstSpelling.values()];
    const collectionIds = distinct.length
      ? await this.repository.ensure(
          storeId,
          distinct.map((name) => ({ id: newId(), name })),
        )
      : [];
    await this.repository.replaceLinks(storeId, productId, collectionIds);
  }
}
