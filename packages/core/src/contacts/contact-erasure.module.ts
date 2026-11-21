import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { TeamModule } from '../team/team.module';
import { ContactErasureRepository } from './contact-erasure.repository';
import { ContactErasureService } from './contact-erasure.service';
import { EraseDeletedContactsJob } from './jobs/erase-deleted-contacts.job';

@Module({
  imports: [AuditModule, ClockModule, OutboxModule, TeamModule],
  providers: [ContactErasureService, ContactErasureRepository, EraseDeletedContactsJob],
  exports: [ContactErasureService],
})
export class ContactErasureModule {}
