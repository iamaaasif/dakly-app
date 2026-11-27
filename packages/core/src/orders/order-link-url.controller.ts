import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';

import type { OrderLinkUrlResponse } from '@dakly/contracts/order-link';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { OrderLinkService } from './order-link.service';

@Controller('order-links')
export class OrderLinkUrlController {
  constructor(@Inject(OrderLinkService) private readonly link: OrderLinkService) {}

  @Get(':productId')
  @RequirePermission('products.view')
  url(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<OrderLinkUrlResponse> {
    return this.link.urlFor(storeId, productId);
  }
}
