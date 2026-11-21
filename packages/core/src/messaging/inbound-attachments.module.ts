import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { UsageModule } from '../usage/usage.module';
import { InboundAttachmentsRepository } from './inbound-attachments.repository';
import { InboundAttachmentsService } from './inbound-attachments.service';
import { InboundMediaReadingService } from './inbound-media-reading.service';

@Module({
  imports: [AiModule, MetaAuthorizationModule, FileStorageModule, UsageModule],
  providers: [InboundAttachmentsService, InboundMediaReadingService, InboundAttachmentsRepository],
  exports: [InboundAttachmentsService, InboundMediaReadingService],
})
export class InboundAttachmentsModule {}
