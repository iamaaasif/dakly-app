import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { ProductsModule } from '../products/products.module';
import { IndexProductSearchOnProductUpdated } from './jobs/index-product-search-on-product-updated.job';
import { ProductSearchIndexService } from './product-search-index.service';
import { ProductSearchService } from './product-search.service';

@Module({
  imports: [AiModule, ProductsModule],
  providers: [ProductSearchService, ProductSearchIndexService, IndexProductSearchOnProductUpdated],
  exports: [ProductSearchService],
})
export class ProductSearchModule {}
