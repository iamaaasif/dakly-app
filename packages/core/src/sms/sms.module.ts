import { Module } from '@nestjs/common';

import { SMS_DRIVER, createSmsDriver } from './sms-provider';
import { SmsService } from './sms.service';

@Module({
  providers: [SmsService, { provide: SMS_DRIVER, useFactory: createSmsDriver }],
  exports: [SmsService],
})
export class SmsModule {}
