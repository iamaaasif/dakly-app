import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { SmsModule } from '../sms/sms.module';
import { SmsSendersModule } from '../sms-senders/sms-senders.module';
import { MessagingService } from './messaging.service';

@Module({
  imports: [ContactsModule, SmsModule, SmsSendersModule],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
