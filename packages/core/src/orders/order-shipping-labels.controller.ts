import { Controller, Get, Header, Inject, Query } from '@nestjs/common';

import {
  shippingLabelQuerySchema,
  type OrderShippingLabels,
} from '@dakly/contracts/order-shipping-labels';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { OrderShippingLabelsService } from './order-shipping-labels.service';

@Controller('orders/shipping-labels')
export class OrderShippingLabelsController {
  constructor(
    @Inject(OrderShippingLabelsService) private readonly service: OrderShippingLabelsService,
  ) {}

  @Get()
  @RequirePermission('orders.view')
  @Header('Cache-Control', 'no-store')
  read(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(shippingLabelQuerySchema)) query: { orderIds: string[] },
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderShippingLabels> {
    return this.service.read(storeId, query.orderIds, access.seeFullPhone);
  }
}
