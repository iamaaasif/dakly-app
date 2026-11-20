import { Module } from '@nestjs/common';

import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { MessageArchiveRepository } from './message-archive.repository';
import { MessageArchiveService } from './message-archive.service';

@Module({
  imports: [FileStorageModule],
  providers: [MessageArchiveRepository, MessageArchiveService],
  exports: [MessageArchiveService],
})
export class MessageArchiveModule {}
