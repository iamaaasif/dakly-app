import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ClockModule, OrdersModule, StoresModule],
  providers: [AnalyticsRepository, AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsReportsModule {}
