import { Module } from '@nestjs/common';

import { KnowledgeSearchModule } from '../ai/knowledge-search.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { SmsSendersModule } from '../sms-senders/sms-senders.module';
import { StoresModule } from '../stores/stores.module';
import { SetupChecklistController } from './setup-checklist.controller';
import { SetupChecklistService } from './setup-checklist.service';

@Module({
  imports: [
    CampaignsModule,
    KnowledgeSearchModule,
    MetaAuthorizationModule,
    OrdersModule,
    ProductsModule,
    SmsSendersModule,
    StoresModule,
  ],
  controllers: [SetupChecklistController],
  providers: [SetupChecklistService],
})
export class SetupChecklistModule {}
