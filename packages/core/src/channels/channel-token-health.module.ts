import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { ChannelConnectionsRepository } from './channel-connections.repository';
import {
  ChannelTokenHealthService,
  META_TOKEN_HEALTH_DRIVER,
} from './channel-token-health.service';
import { CheckChannelTokenJob } from './jobs/check-channel-token.job';
import { QueueChannelTokenChecksJob } from './jobs/queue-channel-token-checks.job';
import { createMetaChannelDriver } from './meta-channel-driver';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.sync }),
    ClockModule,
    CryptoModule,
    NotificationsModule,
    OutboxModule,
  ],
  providers: [
    { provide: META_TOKEN_HEALTH_DRIVER, useFactory: createMetaChannelDriver },
    ChannelConnectionsRepository,
    ChannelTokenHealthService,
    CheckChannelTokenJob,
    QueueChannelTokenChecksJob,
  ],
})
export class ChannelTokenHealthModule {}
