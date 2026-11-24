import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { InboxModule } from '../messaging/inbox.module';
import { ProductSearchModule } from '../product-search/product-search.module';
import { ProductsModule } from '../products/products.module';
import { UsageModule } from '../usage/usage.module';
import { AdLinksController } from './ad-links.controller';
import { AdLinksRepository } from './ad-links.repository';
import { AdLinksService } from './ad-links.service';
import { AdListService } from './ad-list.service';
import { AdReadingService } from './ad-reading.service';
import { AdSourcesRepository } from './ad-sources.repository';
import { AdsController } from './ads.controller';
import { ReadAdOnMessageJob } from './jobs/read-ad-on-message.job';

@Module({
  imports: [
    AiModule,
    InboxModule,
    MetaAuthorizationModule,
    ProductSearchModule,
    ProductsModule,
    UsageModule,
  ],
  providers: [
    AdLinksRepository,
    AdLinksService,
    AdListService,
    AdReadingService,
    AdSourcesRepository,
    ReadAdOnMessageJob,
  ],
  controllers: [AdLinksController, AdsController],
  exports: [AdLinksService],
})
export class AdLinksModule {}
