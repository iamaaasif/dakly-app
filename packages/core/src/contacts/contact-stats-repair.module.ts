import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { ContactStatsSweepService } from './contact-stats-sweep.service';
import { ContactStatsModule } from './contact-stats.module';
import { ReconcileContactStatsJob } from './jobs/reconcile-contact-stats.job';
import { SweepContactStatsJob } from './jobs/sweep-contact-stats.job';

@Module({
  imports: [
    ContactStatsModule,
    StoresModule,
    ClockModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
  ],
  providers: [ContactStatsSweepService, ReconcileContactStatsJob, SweepContactStatsJob],
})
export class ContactStatsRepairModule {}
