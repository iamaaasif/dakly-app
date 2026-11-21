import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { QUEUES } from '../platform/queue/queues';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { BackfillProductSearchEmbeddingsJob } from './jobs/backfill-product-search-embeddings.job';
import { IndexProductSearchOnProductUpdated } from './jobs/index-product-search-on-product-updated.job';
import { StartProductSearchBackfillJob } from './jobs/start-product-search-backfill.job';
import { ProductSearchBackfillService } from './product-search-backfill.service';
import { ProductSearchIndexService } from './product-search-index.service';
import { ProductSearchService } from './product-search.service';

@Module({
  imports: [
    AiModule,
    ProductsModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
  ],
  providers: [
    ProductSearchService,
    ProductSearchIndexService,
    ProductSearchBackfillService,
    IndexProductSearchOnProductUpdated,
    StartProductSearchBackfillJob,
    BackfillProductSearchEmbeddingsJob,
  ],
  exports: [ProductSearchService],
})
export class ProductSearchModule {}
