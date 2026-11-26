import { Controller, Get, Header, Inject, Param, ParseUUIDPipe } from '@nestjs/common';

import type { OrderInvoice } from '@dakly/contracts/order-invoice';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { OrderInvoiceService } from './order-invoice.service';

@Controller('orders/:orderId/invoice')
export class OrderInvoiceController {
  constructor(@Inject(OrderInvoiceService) private readonly service: OrderInvoiceService) {}

  @Get()
  @RequirePermission('orders.view')
  @Header('Cache-Control', 'no-store')
  read(
    @CurrentStore() storeId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentAccess() access: StoreAccess,
  ): Promise<OrderInvoice> {
    return this.service.read(storeId, orderId, access.seeFullPhone);
  }
}
