import { Controller, Delete, HttpCode, Inject, Param, ParseUUIDPipe } from '@nestjs/common';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { OrdersService } from './orders.service';

@Controller('products')
export class OrderProductArchiveController {
  constructor(@Inject(OrdersService) private readonly service: OrdersService) {}

  @Delete(':productId')
  @RequirePermission('products.edit')
  @HttpCode(204)
  archive(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    return this.service.archiveProduct(storeId, productId, { kind: 'user', userId });
  }
}
