import { Module } from '@nestjs/common';

import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({
  imports: [
    CacheModule,
    ClockModule,
    ContactsModule,
    ConsentsModule,
    OutboxModule,
    FileStorageModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsRepository, ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}
