import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { ProductResponse } from '@dakly/contracts/products';

import { productError } from './products.errors';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

// Product names hold 200 characters; the copy suffix is 7.
const MAX_COPY_SOURCE_NAME_LENGTH = 193;

@Injectable()
export class ProductDuplicateService {
  constructor(
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}

  // The copy is a hidden draft with no stock, photos or product codes, so the owner finishes it
  // before customers see it.
  async duplicate(
    storeId: string,
    id: string,
    actor: AuditEntry['actor'],
  ): Promise<ProductResponse> {
    const source = await this.repository.findById(storeId, id);
    if (!source) throw productError('PRODUCT_NOT_FOUND');
    return this.products.create(
      storeId,
      {
        name: `${source.name.slice(0, MAX_COPY_SOURCE_NAME_LENGTH)} (copy)`,
        description: source.description,
        categoryId: source.categoryId,
        brandId: source.brandId,
        weightGrams: source.weightGrams,
        aliases: source.aliases,
        shortDescription: source.shortDescription,
        barcode: null,
        tags: source.tags,
        stockStatus: source.stockStatus,
        pricePoisha: source.pricePoisha,
        compareAtPricePoisha: source.compareAtPricePoisha,
        negotiationEnabled: source.negotiationEnabled,
        negotiationOpeningPoisha: source.negotiationOpeningPoisha,
        negotiationFloorPoisha: source.negotiationFloorPoisha,
        options: source.options,
        isStockTracked: source.isStockTracked,
        isVisibleInChats: source.isVisibleInChats,
        isVisibleInOrderLink: source.isVisibleInOrderLink,
        status: 'hidden',
        variants: source.variants.map((variant) => ({
          optionValues: variant.optionValues,
          sku: null,
          priceOverridePoisha: variant.priceOverridePoisha,
          costPoisha: variant.costPoisha,
          lowStockThreshold: variant.lowStockThreshold,
        })),
      },
      actor,
      { showNegotiationPrices: true },
    );
  }
}
