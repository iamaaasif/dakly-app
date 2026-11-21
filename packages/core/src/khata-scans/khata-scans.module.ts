import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { UsageModule } from '../usage/usage.module';
import { KhataScansController } from './khata-scans.controller';
import { KhataScansRepository } from './khata-scans.repository';
import { KhataScansService } from './khata-scans.service';

@Module({
  imports: [
    AiModule,
    CacheModule,
    ClockModule,
    ContactsModule,
    FileStorageModule,
    OutboxModule,
    UsageModule,
  ],
  controllers: [KhataScansController],
  providers: [KhataScansRepository, KhataScansService],
  exports: [KhataScansService],
})
export class KhataScansModule {}
