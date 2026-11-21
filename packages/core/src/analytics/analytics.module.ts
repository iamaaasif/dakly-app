import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AutomationRunsModule } from '../automations/automation-runs.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ContactStatsModule } from '../contacts/contact-stats.module';
import { ContactsModule } from '../contacts/contacts.module';
import { LinksModule } from '../links/links.module';
import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { AnalyticsReconciliationService } from './analytics-reconciliation.service';
import { AnalyticsSummariesService } from './analytics-summaries.service';
import { AnalyticsRepository } from './analytics.repository';
import { AttributionRebuildService } from './attribution-rebuild.service';
import { AttributeOrderCreated } from './jobs/attribute-order-created.job';
import { BuildOrderSummaryJob } from './jobs/build-order-summary.job';
import { ContinueAttributionRebuild } from './jobs/continue-attribution-rebuild.job';
import { OnAttributionWindowChanged } from './jobs/on-attribution-window-changed.job';
import { ReconcileAnalyticsJob } from './jobs/reconcile-analytics.job';
import { RemoveDeletedBuyer } from './jobs/remove-deleted-buyer.job';
import { ScheduleLifecycleOnStatsRepaired } from './jobs/schedule-lifecycle-on-stats-repaired.job';
import { SummarizeAttributionCreated } from './jobs/summarize-attribution-created.job';
import { SummarizeAttributionRebuilt } from './jobs/summarize-attribution-rebuilt.job';
import { SummarizeAttributionRemoved } from './jobs/summarize-attribution-removed.job';
import { SummarizeOrderCodCollected } from './jobs/summarize-order-cod-collected.job';
import { SummarizeOrderCreated } from './jobs/summarize-order-created.job';
import { SummarizeOrderImported } from './jobs/summarize-order-imported.job';
import { SummarizeOrderEdited } from './jobs/summarize-order-edited.job';
import { SummarizeOrderStageChanged } from './jobs/summarize-order-stage-changed.job';
import { SweepAnalyticsJob } from './jobs/sweep-analytics.job';
import { OrderAttributionEngine } from './order-attribution-engine.service';

@Module({
  imports: [
    AutomationRunsModule,
    CampaignsModule,
    ClockModule,
    ContactStatsModule,
    ContactsModule,
    LinksModule,
    OrdersModule,
    OutboxModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.sync }, { name: QUEUES.bulk }),
  ],
  providers: [
    AnalyticsReconciliationService,
    AnalyticsRepository,
    AnalyticsSummariesService,
    AttributeOrderCreated,
    AttributionRebuildService,
    OnAttributionWindowChanged,
    ContinueAttributionRebuild,
    BuildOrderSummaryJob,
    OrderAttributionEngine,
    ReconcileAnalyticsJob,
    RemoveDeletedBuyer,
    ScheduleLifecycleOnStatsRepaired,
    SummarizeAttributionCreated,
    SummarizeAttributionRebuilt,
    SummarizeAttributionRemoved,
    SummarizeOrderCodCollected,
    SummarizeOrderCreated,
    SummarizeOrderImported,
    SummarizeOrderEdited,
    SummarizeOrderStageChanged,
    SweepAnalyticsJob,
  ],
})
export class AnalyticsModule {}
