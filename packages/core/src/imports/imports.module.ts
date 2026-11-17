import { Module } from '@nestjs/common';

import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { Clock } from '../platform/clock';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { FILE_STORAGE_DRIVER, createFileStorageDriver } from './file-storage-provider';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({
  imports: [ClockModule, ContactsModule, ConsentsModule, OutboxModule],
  controllers: [ImportsController],
  providers: [
    ImportsRepository,
    ImportsService,
    {
      provide: FILE_STORAGE_DRIVER,
      useFactory: (clock: Clock) => createFileStorageDriver(clock),
      inject: [Clock],
    },
  ],
  exports: [ImportsService],
})
export class ImportsModule {}
