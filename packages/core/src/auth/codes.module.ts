import { Module } from '@nestjs/common';
import { CacheModule } from '../platform/cache/cache.module';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures } from './sign-in-failures';

// Sensitive store actions share challenge delivery without importing sessions or AuthModule.
@Module({
  imports: [CacheModule, SmsModule, EmailModule],
  providers: [SignInCodes, SignInFailures],
  exports: [SignInCodes, SignInFailures],
})
export class CodesModule {}
export { SignInCodes } from './sign-in-codes';
export type { SignInSubject } from './sign-in-failures';
