import { Module } from '@nestjs/common';

import { UsersModule } from '../auth/users.module';
import { ClockModule } from '../platform/clock.module';
import { SmsModule } from '../sms/sms.module';
import { SmsSendersController } from './sms-senders.controller';
import { SmsSendersRepository } from './sms-senders.repository';
import { SmsSendersService } from './sms-senders.service';

@Module({
  imports: [ClockModule, SmsModule, UsersModule],
  controllers: [SmsSendersController],
  providers: [SmsSendersService, SmsSendersRepository],
  exports: [SmsSendersService],
})
export class SmsSendersModule {}
