import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { ContactStatsRepository } from './contact-stats.repository';
import { ContactStatsService } from './contact-stats.service';
import { RefreshContactStatsOnContactCreated } from './jobs/refresh-contact-stats-on-contact-created.job';
import { RefreshContactStatsOnOrderCodCollected } from './jobs/refresh-contact-stats-on-order-cod-collected.job';
import { RefreshContactStatsOnOrderCreated } from './jobs/refresh-contact-stats-on-order-created.job';
import { RefreshContactStatsOnOrderStageChanged } from './jobs/refresh-contact-stats-on-order-stage-changed.job';

@Module({
  imports: [ClockModule, OrdersModule, StoresModule],
  providers: [
    ContactStatsRepository,
    ContactStatsService,
    RefreshContactStatsOnContactCreated,
    RefreshContactStatsOnOrderCreated,
    RefreshContactStatsOnOrderStageChanged,
    RefreshContactStatsOnOrderCodCollected,
  ],
  exports: [ContactStatsService],
})
export class ContactStatsModule {}
