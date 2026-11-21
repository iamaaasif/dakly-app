import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { MessagingModule } from '../messaging/messaging.module';
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
import { RestockRequestsController } from './restock-requests.controller';
import { RestockRequestsRepository } from './restock-requests.repository';
import { RestockRequestsService } from './restock-requests.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  imports: [
    ClockModule,
    ContactsModule,
    MessagingModule,
    OutboxModule,
    StoresModule,
    FileStorageModule,
  ],
  controllers: [
    ProductsController,
    ProductPhotosController,
    StockAdjustmentsController,
    RestockRequestsController,
  ],
  providers: [
    ProductsRepository,
    ProductOrderVariantsRepository,
    ProductsService,
    ProductImportService,
    ProductStockRepository,
    ProductStockService,
    RestockRequestsRepository,
    RestockRequestsService,
  ],
  exports: [ProductsService, ProductImportService, ProductStockService, RestockRequestsService],
})
export class ProductsModule {}
