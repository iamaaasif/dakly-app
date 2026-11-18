import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import {
  orderCatalogueQuerySchema,
  type OrderCataloguePage,
  type OrderCatalogueProduct,
  type OrderCatalogueQuery,
} from '@dakly/contracts/orders';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductsService } from '../products/products.service';

@Controller('orders/catalogue')
export class OrderCatalogueController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('orders.edit')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(orderCatalogueQuerySchema)) query: OrderCatalogueQuery,
  ): Promise<OrderCataloguePage> {
    return this.products.listForOrders(storeId, query);
  }

  @Get(':productId')
  @RequirePermission('orders.edit')
  get(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<OrderCatalogueProduct> {
    return this.products.getForOrder(storeId, productId);
  }
}
