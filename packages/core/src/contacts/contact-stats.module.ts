import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { ContactStatsSweepService } from './contact-stats-sweep.service';
import { ContactStatsRepository } from './contact-stats.repository';
import { ContactStatsService } from './contact-stats.service';
import { ReconcileContactStatsJob } from './jobs/reconcile-contact-stats.job';
import { RefreshContactStatsOnContactCreated } from './jobs/refresh-contact-stats-on-contact-created.job';
import { RefreshContactStatsOnOrderCodCollected } from './jobs/refresh-contact-stats-on-order-cod-collected.job';
import { RefreshContactStatsOnOrderCreated } from './jobs/refresh-contact-stats-on-order-created.job';
import { RefreshContactStatsOnOrderStageChanged } from './jobs/refresh-contact-stats-on-order-stage-changed.job';
import { SweepContactStatsJob } from './jobs/sweep-contact-stats.job';

@Module({
  imports: [
    ClockModule,
    OrdersModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
  ],
  providers: [
    ContactStatsRepository,
    ContactStatsService,
    ContactStatsSweepService,
    SweepContactStatsJob,
    ReconcileContactStatsJob,
    RefreshContactStatsOnContactCreated,
    RefreshContactStatsOnOrderCreated,
    RefreshContactStatsOnOrderStageChanged,
    RefreshContactStatsOnOrderCodCollected,
  ],
})
export class ContactStatsModule {}
