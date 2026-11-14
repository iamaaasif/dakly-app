import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';
import { Module } from '@nestjs/common';
import { PermissionGuard } from '../platform/tenancy/permission.guard';
import { PERMISSION_EVALUATOR } from '../platform/tenancy/permission-evaluator';
import { canAccess, hasKnownRole } from './permissions';
import { UsersModule } from '../auth/users.module';
import { BillingModule } from '../billing/billing.module';
import { AuditModule } from '../audit/audit.module';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';
import { CacheModule } from '../platform/cache/cache.module';
import { loadEnv } from '../platform/config/env';
import { Clock } from '../platform/clock';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { InvitesController } from './invites.controller';
import { INVITE_ORIGIN, InviteDelivery } from './invite-delivery';

@Module({
  imports: [UsersModule, BillingModule, AuditModule, SmsModule, EmailModule, CacheModule],
  controllers: [MembersController, InvitesController],
  providers: [
    Clock,
    MembersRepository,
    MembersService,
    InviteDelivery,
    { provide: INVITE_ORIGIN, useFactory: () => loadEnv().WEB_ORIGINS[0] },
    TeamRepository,
    TeamService,
    { provide: PERMISSION_EVALUATOR, useValue: { canAccess, hasKnownRole } },
    PermissionGuard,
  ],
  exports: [TeamService, PERMISSION_EVALUATOR, PermissionGuard],
})
export class TeamModule {}
