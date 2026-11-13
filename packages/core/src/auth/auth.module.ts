import { Module } from '@nestjs/common';
import { CacheModule } from '../platform/cache/cache.module';
import { Clock } from '../platform/clock';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from './users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures } from './sign-in-failures';
import { SMS_DRIVER, createSmsDriver } from './sms-provider';

@Module({
  imports: [CacheModule, UsersModule, SessionsModule],
  controllers: [AuthController],
  providers: [
    Clock,
    AuthService,
    SignInCodes,
    SignInFailures,
    { provide: SMS_DRIVER, useFactory: createSmsDriver },
  ],
  exports: [AuthService, SignInCodes, SignInFailures],
})
export class AuthModule {}
