import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EMAIL_DRIVER, createEmailDriver } from './email-provider';

@Module({
  providers: [EmailService, { provide: EMAIL_DRIVER, useFactory: createEmailDriver }],
  exports: [EmailService],
})
export class EmailModule {}
