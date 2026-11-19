import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { SocialController } from './social.controller';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    MetaAuthorizationModule,
    OutboxModule,
    StoresModule,
    TeamModule,
  ],
  controllers: [SocialController],
  providers: [SocialService, SocialRepository],
})
export class SocialModule {}
