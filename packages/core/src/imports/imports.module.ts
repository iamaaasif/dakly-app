import { Module } from '@nestjs/common';

import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ProductsModule } from '../products/products.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';
import { ProductImportsController } from './product-imports.controller';
import { ProductImportsRepository } from './product-imports.repository';
import { ProductImportsService } from './product-imports.service';
import { UndoCustomerImport } from './undo-customer-import';

@Module({
  imports: [
    CacheModule,
    ClockModule,
    ContactsModule,
    ConsentsModule,
    OutboxModule,
    FileStorageModule,
    ProductsModule,
  ],
  controllers: [ImportsController, ProductImportsController],
  providers: [
    ImportsRepository,
    ImportsService,
    ProductImportsRepository,
    ProductImportsService,
    UndoCustomerImport,
  ],
  exports: [ImportsService, ProductImportsService],
})
export class ImportsModule {}
