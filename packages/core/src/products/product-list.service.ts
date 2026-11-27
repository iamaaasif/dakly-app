import { Inject, Injectable } from '@nestjs/common';

import type { ProductListQuery, ProductListResponse } from '@dakly/contracts/products';

import { OrderProductSalesService } from '../orders/order-product-sales.service';
import { StoresService } from '../stores/stores.service';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

// The products screen: one page of products plus what its table and footer show.
@Injectable()
export class ProductListService {
  constructor(
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(ProductsRepository) private readonly repository: ProductsRepository,
    @Inject(OrderProductSalesService) private readonly sales: OrderProductSalesService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async list(
    storeId: string,
    query: ProductListQuery,
    showNegotiationPrices: boolean,
  ): Promise<ProductListResponse> {
    const [page, { stock }] = await Promise.all([
      this.products.list(storeId, query, showNegotiationPrices),
      this.stores.settings(storeId),
    ]);
    const toConfirm = new Map(
      (
        await this.sales.unitsToConfirm(
          storeId,
          page.items.flatMap((product) => product.variants.map((variant) => variant.id)),
        )
      ).map(({ variantId, units }) => [variantId, units]),
    );
    return {
      items: page.items.map((product) => ({
        ...product,
        waitingToConfirmCount: product.variants.reduce(
          (total, variant) => total + (toConfirm.get(variant.id) ?? 0),
          0,
        ),
      })),
      nextCursor: page.nextCursor,
      totalCount: await this.repository.count(storeId, query, stock.lowStockThreshold),
    };
  }
}
