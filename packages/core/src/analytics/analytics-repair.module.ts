import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { AnalyticsReconciliationService } from './analytics-reconciliation.service';
import { AnalyticsModule } from './analytics.module';
import { ReconcileAnalyticsJob } from './jobs/reconcile-analytics.job';
import { SweepAnalyticsJob } from './jobs/sweep-analytics.job';

@Module({
  imports: [
    AnalyticsModule,
    ClockModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
  ],
  providers: [AnalyticsReconciliationService, ReconcileAnalyticsJob, SweepAnalyticsJob],
})
export class AnalyticsRepairModule {}
