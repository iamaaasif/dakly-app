import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CodesModule } from '../auth/codes.module';
import { UsersModule } from '../auth/users.module';
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { PERMISSION_EVALUATOR } from '../platform/tenancy/permission-evaluator';
import { PermissionGuard } from '../platform/tenancy/permission.guard';
import { SmsModule } from '../sms/sms.module';
import { INVITE_ORIGIN, InviteDelivery } from './invite-delivery';
import { InvitesController } from './invites.controller';
import { MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';
import { OwnershipTransferController } from './ownership-transfer.controller';
import { OwnershipTransferRepository } from './ownership-transfer.repository';
import { OwnershipTransferService } from './ownership-transfer.service';
import { canAccess, hasKnownRole } from './permissions';
import { RolesController } from './roles.controller';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

@Module({
  imports: [
    CodesModule,
    UsersModule,
    BillingModule,
    AuditModule,
    SmsModule,
    EmailModule,
    CacheModule,
    ClockModule,
  ],
  controllers: [OwnershipTransferController, MembersController, InvitesController, RolesController],
  providers: [
    OwnershipTransferRepository,
    OwnershipTransferService,
    RolesService,
    RolesRepository,
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
