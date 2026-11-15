import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SMS_DRIVER, createSmsDriver } from './sms-provider';

@Module({
  providers: [SmsService, { provide: SMS_DRIVER, useFactory: createSmsDriver }],
  exports: [SmsService],
})
export class SmsModule {}
