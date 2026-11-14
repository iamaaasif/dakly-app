import { CodesModule } from '../auth/codes.module';
import { OwnershipTransferRepository } from './ownership-transfer.repository';
import { OwnershipTransferService } from './ownership-transfer.service';
import { OwnershipTransferController } from './ownership-transfer.controller';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
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
  imports: [
    CodesModule,
    UsersModule,
    BillingModule,
    AuditModule,
    SmsModule,
    EmailModule,
    CacheModule,
  ],
  controllers: [OwnershipTransferController, MembersController, InvitesController, RolesController],
  providers: [
    Clock,
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
