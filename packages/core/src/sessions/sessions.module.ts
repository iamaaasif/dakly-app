import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { UsersModule } from '../auth/users.module';
import { ClockModule } from '../platform/clock.module';
import { OriginGuard } from '../platform/tenancy/origin.guard';
import { PermissionGuard } from '../platform/tenancy/permission.guard';
import { StoreGuard } from '../platform/tenancy/store.guard';
import { UserGuard } from '../platform/tenancy/user.guard';
import { TeamModule } from '../team/team.module';
import { SessionGuard } from './session.guard';
import { SessionsController } from './sessions.controller';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  imports: [UsersModule, TeamModule, AccountSecurityEventsModule, ClockModule],
  controllers: [SessionsController],
  providers: [
    SessionsService,
    SessionsRepository,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: UserGuard },
    { provide: APP_GUARD, useClass: StoreGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
