import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../auth/users.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { ConversationReplyService } from './conversation-reply.service';
import { InboxController } from './inbox.controller';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { MessagingModule } from './messaging.module';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    ContactsModule,
    MessagingModule,
    SendingModule,
    StoresModule,
    TeamModule,
    UsersModule,
  ],
  controllers: [InboxController],
  providers: [InboxRepository, InboxService, ConversationReplyService],
  exports: [InboxRepository, InboxService],
})
export class InboxModule {}
