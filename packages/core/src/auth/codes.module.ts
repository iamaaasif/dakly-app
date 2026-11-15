import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module';
import { CacheModule } from '../platform/cache/cache.module';
import { SmsModule } from '../sms/sms.module';
import { SignInCodes } from './sign-in-codes';
import { SignInCodesService } from './sign-in-codes.service';
import { SignInFailures } from './sign-in-failures';

// Sensitive store actions share challenge delivery without importing sessions or AuthModule.
@Module({
  imports: [CacheModule, SmsModule, EmailModule],
  providers: [SignInCodes, SignInCodesService, SignInFailures],
  exports: [SignInCodes, SignInCodesService, SignInFailures],
})
export class CodesModule {}
