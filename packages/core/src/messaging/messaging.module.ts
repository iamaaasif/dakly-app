import { Module } from '@nestjs/common';

import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SmsModule } from '../sms/sms.module';
import { SmsSendersModule } from '../sms-senders/sms-senders.module';
import { InboundMessagingRepository } from './inbound-messaging.repository';
import { MessagingService } from './messaging.service';

@Module({
  imports: [
    ContactsModule,
    ConsentsModule,
    ClockModule,
    OutboxModule,
    MetaAuthorizationModule,
    SmsModule,
    SmsSendersModule,
  ],
  providers: [MessagingService, InboundMessagingRepository],
  exports: [MessagingService],
})
export class MessagingModule {}
