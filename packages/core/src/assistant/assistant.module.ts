import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AnalyticsReportsModule } from '../analytics/analytics-reports.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { TeamModule } from '../team/team.module';
import { UsageModule } from '../usage/usage.module';
import { AssistantProductToolsService } from './assistant-product-tools.service';
import { AssistantToolsService } from './assistant-tools.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [
    AiModule,
    AnalyticsReportsModule,
    OrdersModule,
    ProductsModule,
    TeamModule,
    UsageModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantToolsService, AssistantProductToolsService],
})
export class AssistantModule {}
