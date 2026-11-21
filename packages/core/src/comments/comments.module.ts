import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { CommentsController } from './comments.controller';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    ContactsModule,
    MetaAuthorizationModule,
    SendingModule,
    StoresModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsRepository, CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
