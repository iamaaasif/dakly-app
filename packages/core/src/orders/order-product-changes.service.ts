import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { ChangeProductInput, ProductResponse } from '@dakly/contracts/products';

import { StoreTransaction } from '../platform/database/store-transaction';
import { ProductsService } from '../products/products.service';
import { productArchiveStages } from './order-stage';
import { orderError } from './orders.errors';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrderProductChangesService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(ProductsService) private readonly products: ProductsService,
  ) {}

  // A variant left out of the saved list is archived, so one that an open order still needs stays.
  change(
    storeId: string,
    productId: string,
    input: ChangeProductInput,
    actor: AuditEntry['actor'],
  ): Promise<ProductResponse> {
    return this.transaction.run(storeId, async () => {
      if (input.variants) {
        await this.products.lockArchiveVariants(storeId, productId);
        const kept = new Set(input.variants.map((variant) => variant.id));
        const { variants: current } = await this.products.getById(storeId, productId);
        const removedIds = current.map(({ id }) => id).filter((id) => !kept.has(id));
        if (
          removedIds.length &&
          (await this.repository.hasItemsInStages(storeId, removedIds, productArchiveStages))
        )
          throw orderError('PRODUCT_VARIANT_IN_OPEN_ORDERS');
      }
      return this.products.edit(storeId, productId, input, actor);
    });
  }
}
