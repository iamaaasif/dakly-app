import { Module } from '@nestjs/common';

import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ConsentsModule } from '../consents/consents.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SendingModule } from '../sending/sending.module';
import { SmsModule } from '../sms/sms.module';
import { SmsSendersModule } from '../sms-senders/sms-senders.module';
import { ChannelReceiptsRepository } from './channel-receipts.repository';
import { ChannelReceiptsService } from './channel-receipts.service';
import { InboundMessagingRepository } from './inbound-messaging.repository';
import { MessagingService } from './messaging.service';
import { OutboundMessagingRepository } from './outbound-messaging.repository';

@Module({
  imports: [
    ContactsModule,
    ConsentsModule,
    ClockModule,
    OutboxModule,
    SendingModule,
    MetaAuthorizationModule,
    SmsModule,
    SmsSendersModule,
  ],
  providers: [
    MessagingService,
    InboundMessagingRepository,
    OutboundMessagingRepository,
    ChannelReceiptsRepository,
    ChannelReceiptsService,
  ],
  exports: [MessagingService, ChannelReceiptsService],
})
export class MessagingModule {}
