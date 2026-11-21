import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ContactMemoryModule } from '../contact-memory/contact-memory.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { ContactMergeController } from './contact-merge.controller';
import { ContactMergeRepository } from './contact-merge.repository';
import { ContactMergeService } from './contact-merge.service';

@Module({
  imports: [AuditModule, ClockModule, ContactMemoryModule, OutboxModule],
  controllers: [ContactMergeController],
  providers: [ContactMergeService, ContactMergeRepository],
})
export class ContactMergeModule {}
