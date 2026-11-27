import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  orderCustomerLookupQuerySchema,
  type OrderCustomerLookup,
  type OrderCustomerLookupQuery,
} from '@dakly/contracts/order-entry';
import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderEntryService } from './order-entry.service';

@Controller('orders')
export class OrderEntryController {
  constructor(@Inject(OrderEntryService) private readonly entry: OrderEntryService) {}

  @Get('customer-lookup')
  @RequirePermission('orders.edit')
  lookupCustomer(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(orderCustomerLookupQuerySchema)) query: OrderCustomerLookupQuery,
  ): Promise<OrderCustomerLookup> {
    return this.entry.lookupCustomer(storeId, query, access);
  }

  @Get('catalogue/recent')
  @RequirePermission('orders.edit')
  recentProducts(@CurrentStore() storeId: string): Promise<OrderCatalogueProduct[]> {
    return this.entry.recentProducts(storeId);
  }
}
