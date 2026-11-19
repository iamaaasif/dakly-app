import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ContactStatsModule } from '../contacts/contact-stats.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { AnalyticsReconciliationService } from './analytics-reconciliation.service';
import { AnalyticsSummariesService } from './analytics-summaries.service';
import { AnalyticsRepository } from './analytics.repository';
import { BuildOrderSummaryJob } from './jobs/build-order-summary.job';
import { ReconcileAnalyticsJob } from './jobs/reconcile-analytics.job';
import { RemoveDeletedBuyer } from './jobs/remove-deleted-buyer.job';
import { ScheduleLifecycleOnStatsRepaired } from './jobs/schedule-lifecycle-on-stats-repaired.job';
import { SummarizeOrderCodCollected } from './jobs/summarize-order-cod-collected.job';
import { SummarizeOrderCreated } from './jobs/summarize-order-created.job';
import { SummarizeOrderEdited } from './jobs/summarize-order-edited.job';
import { SummarizeOrderStageChanged } from './jobs/summarize-order-stage-changed.job';
import { SweepAnalyticsJob } from './jobs/sweep-analytics.job';

@Module({
  imports: [
    ClockModule,
    ContactStatsModule,
    ContactsModule,
    OrdersModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.sync }, { name: QUEUES.bulk }),
  ],
  providers: [
    AnalyticsReconciliationService,
    AnalyticsRepository,
    AnalyticsSummariesService,
    BuildOrderSummaryJob,
    ReconcileAnalyticsJob,
    RemoveDeletedBuyer,
    ScheduleLifecycleOnStatsRepaired,
    SummarizeOrderCodCollected,
    SummarizeOrderCreated,
    SummarizeOrderEdited,
    SummarizeOrderStageChanged,
    SweepAnalyticsJob,
  ],
})
export class AnalyticsModule {}
