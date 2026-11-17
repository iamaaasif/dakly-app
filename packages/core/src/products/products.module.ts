import { Module } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { createFileStorageDriver, FILE_STORAGE_DRIVER } from './file-storage.provider';
import { ProductPhotosController } from './product-photos.controller';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  imports: [ClockModule, OutboxModule, StoresModule],
  controllers: [ProductsController, ProductPhotosController, StockAdjustmentsController],
  providers: [
    ProductsRepository,
    ProductsService,
    { provide: FILE_STORAGE_DRIVER, inject: [Clock], useFactory: createFileStorageDriver },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
