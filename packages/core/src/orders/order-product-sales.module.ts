import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { OrderProductSalesRepository } from './order-product-sales.repository';
import { OrderProductSalesService } from './order-product-sales.service';

@Module({
  imports: [ClockModule, StoresModule],
  providers: [OrderProductSalesRepository, OrderProductSalesService],
  exports: [OrderProductSalesService],
})
export class OrderProductSalesModule {}
