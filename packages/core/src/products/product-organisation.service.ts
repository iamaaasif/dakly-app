import { Inject, Injectable } from '@nestjs/common';

import { ProductCollectionsService } from './product-collections.service';
import { ProductTagsService } from './product-tags.service';

type Grouping = { tags?: string[]; collections?: string[] };

// The names a product is filed under in the Organisation card. A name list left out keeps what the
// product has; an empty one on a new product has nothing to link, so it is not written.
@Injectable()
export class ProductOrganisationService {
  constructor(
    @Inject(ProductTagsService) private readonly tags: ProductTagsService,
    @Inject(ProductCollectionsService) private readonly collections: ProductCollectionsService,
  ) {}

  async save(
    storeId: string,
    productId: string,
    { tags, collections }: Grouping,
    isNewProduct = false,
  ): Promise<void> {
    if (tags && !(isNewProduct && !tags.length))
      await this.tags.setForProduct(storeId, productId, tags);
    if (collections && !(isNewProduct && !collections.length))
      await this.collections.setForProduct(storeId, productId, collections);
  }
}
