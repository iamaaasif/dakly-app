import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { ProductPhotoTagBackfillService } from './product-photo-tag-backfill.service';
import { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import { ProductPhotoTagsService } from './product-photo-tags.service';

@Module({
  imports: [
    AiModule,
    FileStorageModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
  ],
  providers: [ProductPhotoTagsRepository, ProductPhotoTagsService, ProductPhotoTagBackfillService],
  exports: [ProductPhotoTagsService, ProductPhotoTagBackfillService],
})
export class ProductPhotoTagsModule {}
