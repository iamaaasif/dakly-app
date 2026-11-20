import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { ProductPhotosController } from './product-photos.controller';
import { ProductStockRepository } from './product-stock.repository';
import { ProductStockService } from './product-stock.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  imports: [ClockModule, OutboxModule, StoresModule, FileStorageModule],
  controllers: [ProductsController, ProductPhotosController, StockAdjustmentsController],
  providers: [
    ProductsRepository,
    ProductOrderVariantsRepository,
    ProductsService,
    ProductStockRepository,
    ProductStockService,
  ],
  exports: [ProductsService, ProductStockService],
})
export class ProductsModule {}
