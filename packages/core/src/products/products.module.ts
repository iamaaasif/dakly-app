import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  imports: [ClockModule, OutboxModule, StoresModule],
  controllers: [ProductsController, StockAdjustmentsController],
  providers: [ProductsRepository, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
