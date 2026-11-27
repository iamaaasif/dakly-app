import { Inject, Injectable } from '@nestjs/common';

import { ProductBrandsService } from './product-brands.service';
import { ProductCategoriesService } from './product-categories.service';
import { ProductCollectionsService } from './product-collections.service';
import { ProductTagsService } from './product-tags.service';

// What a product points at in the shop's own lists: category, brand, tags and collections.
@Injectable()
export class ProductLabelsService {
  constructor(
    @Inject(ProductCategoriesService) private readonly categories: ProductCategoriesService,
    @Inject(ProductBrandsService) private readonly brands: ProductBrandsService,
    @Inject(ProductTagsService) private readonly tags: ProductTagsService,
    @Inject(ProductCollectionsService) private readonly collections: ProductCollectionsService,
  ) {}

  async assertExist(
    storeId: string,
    { categoryId, brandId }: { categoryId?: string | null; brandId?: string | null },
  ): Promise<void> {
    if (categoryId) await this.categories.assertExists(storeId, categoryId);
    if (brandId) await this.brands.assertExists(storeId, brandId);
  }

  // A list left out keeps what the product has.
  async save(
    storeId: string,
    productId: string,
    { tags, collectionIds }: { tags?: string[]; collectionIds?: string[] },
  ): Promise<void> {
    if (tags) await this.tags.setForProduct(storeId, productId, tags);
    if (collectionIds) await this.collections.setForProduct(storeId, productId, collectionIds);
  }
}
