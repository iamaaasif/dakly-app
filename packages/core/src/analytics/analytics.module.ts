import { Module } from '@nestjs/common';

import { ContactStatsModule } from '../contacts/contact-stats.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { AnalyticsSummariesService } from './analytics-summaries.service';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import { SummarizeOrderCreated } from './jobs/summarize-order-created.job';
import { SummarizeOrderEdited } from './jobs/summarize-order-edited.job';
import { SummarizeOrderStageChanged } from './jobs/summarize-order-stage-changed.job';

@Module({
  imports: [ClockModule, ContactStatsModule, ContactsModule, OrdersModule, StoresModule],
  providers: [
    AnalyticsRepository,
    AnalyticsService,
    AnalyticsSummariesService,
    SummarizeOrderCreated,
    SummarizeOrderEdited,
    SummarizeOrderStageChanged,
  ],
  exports: [AnalyticsService, AnalyticsSummariesService],
})
export class AnalyticsModule {}
