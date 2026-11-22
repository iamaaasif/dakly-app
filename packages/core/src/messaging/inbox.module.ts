import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../auth/users.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';

@Module({
  imports: [AuditModule, ClockModule, ContactsModule, StoresModule, TeamModule, UsersModule],
  controllers: [InboxController],
  providers: [InboxRepository, InboxService],
  exports: [InboxRepository, InboxService],
})
export class InboxModule {}
