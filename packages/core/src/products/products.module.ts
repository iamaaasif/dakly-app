import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { ProductImportService } from './product-import.service';
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
    ProductImportService,
    ProductStockRepository,
    ProductStockService,
  ],
  exports: [ProductsService, ProductImportService, ProductStockService],
})
export class ProductsModule {}
