import { Module } from '@nestjs/common';

import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TeamModule } from '../team/team.module';
import { EventStreamController } from './event-stream.controller';
import { NotificationStreamService } from './notification-stream.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [CacheModule, ClockModule, OutboxModule, SessionsModule, TeamModule],
  controllers: [NotificationsController, EventStreamController],
  providers: [NotificationsRepository, NotificationsService, NotificationStreamService],
  exports: [NotificationsService, NotificationStreamService],
})
export class NotificationsModule {}
