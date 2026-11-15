import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../auth/users.module';
import { TeamModule } from '../team/team.module';
import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { Clock } from '../platform/clock';
import { OriginGuard } from '../platform/tenancy/origin.guard';
import { UserGuard } from '../platform/tenancy/user.guard';
import { StoreGuard } from '../platform/tenancy/store.guard';
import { PermissionGuard } from '../platform/tenancy/permission.guard';
import { SessionGuard } from './session.guard';
import { SessionsController } from './sessions.controller';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  imports: [UsersModule, TeamModule, AccountSecurityEventsModule],
  controllers: [SessionsController],
  providers: [
    Clock,
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
