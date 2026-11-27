import { Inject, Injectable } from '@nestjs/common';

import type {
  ProductCollectionInput,
  ProductCollectionListResponse,
  ProductCollectionResponse,
} from '@dakly/contracts/product-lists';

import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductCollectionsRepository } from './product-collections.repository';
import { productError } from './products.errors';

@Injectable()
export class ProductCollectionsService {
  constructor(
    @Inject(ProductCollectionsRepository) private readonly repository: ProductCollectionsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async list(storeId: string): Promise<ProductCollectionListResponse> {
    return { items: await this.repository.list(storeId) };
  }

  create(storeId: string, { name }: ProductCollectionInput): Promise<ProductCollectionResponse> {
    return this.transaction.run(storeId, async () => {
      const id = newId();
      if (!(await this.repository.insert(storeId, { id, name })))
        throw productError('PRODUCT_COLLECTION_NAME_TAKEN');
      return { id, name, productCount: 0 };
    });
  }

  async setForProduct(storeId: string, productId: string, ids: string[]): Promise<void> {
    if (ids.length && (await this.repository.countExisting(storeId, ids)) !== new Set(ids).size)
      throw productError('PRODUCT_COLLECTION_NOT_FOUND');
    await this.repository.replaceLinks(storeId, productId, [...new Set(ids)]);
  }
}
