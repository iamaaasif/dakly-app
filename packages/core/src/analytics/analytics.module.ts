import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ContactStatsModule } from '../contacts/contact-stats.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { AnalyticsSummariesService } from './analytics-summaries.service';
import { AnalyticsRepository } from './analytics.repository';
import { BuildOrderSummaryJob } from './jobs/build-order-summary.job';
import { SummarizeOrderCodCollected } from './jobs/summarize-order-cod-collected.job';
import { SummarizeOrderCreated } from './jobs/summarize-order-created.job';
import { SummarizeOrderEdited } from './jobs/summarize-order-edited.job';
import { SummarizeOrderStageChanged } from './jobs/summarize-order-stage-changed.job';

@Module({
  imports: [
    ClockModule,
    ContactStatsModule,
    ContactsModule,
    OrdersModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.sync }),
  ],
  providers: [
    AnalyticsRepository,
    AnalyticsSummariesService,
    BuildOrderSummaryJob,
    SummarizeOrderCodCollected,
    SummarizeOrderCreated,
    SummarizeOrderEdited,
    SummarizeOrderStageChanged,
  ],
})
export class AnalyticsModule {}
