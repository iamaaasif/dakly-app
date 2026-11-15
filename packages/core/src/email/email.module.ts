import { Module } from '@nestjs/common';

import { EMAIL_DRIVER, createEmailDriver } from './email-provider';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService, { provide: EMAIL_DRIVER, useFactory: createEmailDriver }],
  exports: [EmailService],
})
export class EmailModule {}
