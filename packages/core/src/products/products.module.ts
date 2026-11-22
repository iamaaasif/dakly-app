import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContactsModule } from '../contacts/contacts.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { ProductBulkEditsController } from './product-bulk-edits.controller';
import { ProductBulkEditsRepository } from './product-bulk-edits.repository';
import { ProductBulkEditsService } from './product-bulk-edits.service';
import { ProductExportController } from './product-export.controller';
import { ProductExportService } from './product-export.service';
import { ProductImportService } from './product-import.service';
import { ProductOrderVariantsRepository } from './product-order-variants.repository';
import { ProductPhotosController } from './product-photos.controller';
import { ProductSearchSourceService } from './product-search-source.service';
import { ProductSearchRepository } from './product-search.repository';
import { ProductStockRepository } from './product-stock.repository';
import { ProductStockService } from './product-stock.service';
import { ProductVariantPhotosController } from './product-variant-photos.controller';
import { ProductVariantPhotosRepository } from './product-variant-photos.repository';
import { ProductVariantPhotosService } from './product-variant-photos.service';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { RestockRequestsController } from './restock-requests.controller';
import { RestockRequestsRepository } from './restock-requests.repository';
import { RestockRequestsService } from './restock-requests.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    ContactsModule,
    MessagingModule,
    OutboxModule,
    StoresModule,
    FileStorageModule,
  ],
  controllers: [
    ProductBulkEditsController,
    ProductExportController,
    ProductsController,
    ProductPhotosController,
    ProductVariantPhotosController,
    StockAdjustmentsController,
    RestockRequestsController,
  ],
  providers: [
    ProductBulkEditsRepository,
    ProductBulkEditsService,
    ProductsRepository,
    ProductOrderVariantsRepository,
    ProductsService,
    ProductVariantPhotosRepository,
    ProductVariantPhotosService,
    ProductImportService,
    ProductExportService,
    ProductStockRepository,
    ProductStockService,
    RestockRequestsRepository,
    RestockRequestsService,
    ProductSearchRepository,
    ProductSearchSourceService,
  ],
  exports: [
    ProductsService,
    ProductImportService,
    ProductStockService,
    RestockRequestsService,
    ProductSearchSourceService,
  ],
})
export class ProductsModule {}
