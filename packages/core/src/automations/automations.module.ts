import { Module } from '@nestjs/common';

import { UsersModule } from '../auth/users.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { AutomationsController } from './automations.controller';
import { AutomationsRepository } from './automations.repository';
import { AutomationsService } from './automations.service';

@Module({
  imports: [
    ClockModule,
    EmailModule,
    NotificationsModule,
    OutboxModule,
    StoresModule,
    TeamModule,
    UsersModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsRepository, AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
