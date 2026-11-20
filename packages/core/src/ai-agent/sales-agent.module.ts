import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { KnowledgeSearchModule } from '../ai/knowledge-search.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { InboxModule } from '../messaging/inbox.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { SalesAgentToolsService } from './sales-agent-tools.service';
import { SalesAgentService } from './sales-agent.service';

@Module({
  imports: [
    AiModule,
    DeliveryModule,
    InboxModule,
    KnowledgeSearchModule,
    OrdersModule,
    ProductsModule,
    StoresModule,
  ],
  providers: [SalesAgentService, SalesAgentToolsService],
  exports: [SalesAgentService],
})
export class SalesAgentModule {}
