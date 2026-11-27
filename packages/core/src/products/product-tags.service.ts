import { Inject, Injectable } from '@nestjs/common';

import type { ProductTagListResponse } from '@dakly/contracts/product-lists';

import { newId } from '../platform/database/new-id';
import { ProductTagsRepository } from './product-tags.repository';

@Injectable()
export class ProductTagsService {
  constructor(@Inject(ProductTagsRepository) private readonly repository: ProductTagsRepository) {}

  async list(storeId: string): Promise<ProductTagListResponse> {
    return { items: await this.repository.list(storeId) };
  }

  // Replaces a product's tags, creating the names the shop has not used before.
  async setForProduct(storeId: string, productId: string, names: string[]): Promise<void> {
    const firstSpelling = new Map<string, string>();
    for (const name of names)
      if (!firstSpelling.has(name.toLowerCase())) firstSpelling.set(name.toLowerCase(), name);
    const distinct = [...firstSpelling.values()];
    const tagIds = distinct.length
      ? await this.repository.ensure(
          storeId,
          distinct.map((name) => ({ id: newId(), name })),
        )
      : [];
    await this.repository.replaceLinks(storeId, productId, tagIds);
  }
}
