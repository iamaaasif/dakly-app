import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { TeamModule } from '../team/team.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ClockModule, OutboxModule, TeamModule],
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
