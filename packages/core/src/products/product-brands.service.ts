import { Inject, Injectable } from '@nestjs/common';

import type {
  ProductBrandInput,
  ProductBrandListResponse,
  ProductBrandResponse,
} from '@dakly/contracts/product-lists';

import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductBrandsRepository } from './product-brands.repository';
import { productError } from './products.errors';

@Injectable()
export class ProductBrandsService {
  constructor(
    @Inject(ProductBrandsRepository) private readonly repository: ProductBrandsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async list(storeId: string): Promise<ProductBrandListResponse> {
    return { items: await this.repository.list(storeId) };
  }

  create(storeId: string, { name }: ProductBrandInput): Promise<ProductBrandResponse> {
    return this.transaction.run(storeId, async () => {
      const id = await this.insertBrand(storeId, name);
      return { id, name, productCount: 0 };
    });
  }

  async assertExists(storeId: string, id: string): Promise<void> {
    if (!(await this.repository.find(storeId, id))) throw productError('PRODUCT_BRAND_NOT_FOUND');
  }

  private async insertBrand(storeId: string, name: string): Promise<string> {
    if (await this.repository.findByName(storeId, name))
      throw productError('PRODUCT_BRAND_NAME_TAKEN');
    const id = newId();
    if (!(await this.repository.insert(storeId, { id, name })))
      throw productError('PRODUCT_BRAND_NAME_TAKEN');
    return id;
  }
}
