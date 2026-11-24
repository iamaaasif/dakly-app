import { Module } from '@nestjs/common';

import { ProductsModule } from '../products/products.module';
import { AdLinksController } from './ad-links.controller';
import { AdLinksRepository } from './ad-links.repository';
import { AdLinksService } from './ad-links.service';

@Module({
  imports: [ProductsModule],
  providers: [AdLinksRepository, AdLinksService],
  controllers: [AdLinksController],
  exports: [AdLinksService],
})
export class AdLinksModule {}
