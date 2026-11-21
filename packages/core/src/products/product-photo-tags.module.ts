import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { UsageModule } from '../usage/usage.module';
import { ProductPhotoTagsRepository } from './product-photo-tags.repository';
import { ProductPhotoTagsService } from './product-photo-tags.service';

@Module({
  imports: [AiModule, FileStorageModule, UsageModule],
  providers: [ProductPhotoTagsRepository, ProductPhotoTagsService],
  exports: [ProductPhotoTagsService],
})
export class ProductPhotoTagsModule {}
