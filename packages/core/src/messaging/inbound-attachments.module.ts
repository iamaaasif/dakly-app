import { Module } from '@nestjs/common';

import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { InboundAttachmentsRepository } from './inbound-attachments.repository';
import { InboundAttachmentsService } from './inbound-attachments.service';

@Module({
  imports: [MetaAuthorizationModule, FileStorageModule],
  providers: [InboundAttachmentsService, InboundAttachmentsRepository],
  exports: [InboundAttachmentsService],
})
export class InboundAttachmentsModule {}
