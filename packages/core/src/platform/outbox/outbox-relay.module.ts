import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { QUEUES } from '../queue/queues';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxRepository } from './outbox.repository';

// Only the worker relays; producers import OutboxModule and need no queue.
@Module({
  imports: [
    DiscoveryModule,
    BullModule.registerQueue({ name: QUEUES.transactional }),
    BullModule.registerQueue({ name: QUEUES.bulk }),
    BullModule.registerQueue({ name: QUEUES.workflow }),
    BullModule.registerQueue({ name: QUEUES.campaign }),
  ],
  providers: [OutboxRepository, OutboxRelayService],
  exports: [OutboxRelayService],
})
export class OutboxRelayModule {}
