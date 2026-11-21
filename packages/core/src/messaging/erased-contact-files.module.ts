import { Module } from '@nestjs/common';

import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { ErasedContactFilesService } from './erased-contact-files.service';
import { DeleteErasedContactFilesJob } from './jobs/delete-erased-contact-files.job';

@Module({
  imports: [FileStorageModule],
  providers: [ErasedContactFilesService, DeleteErasedContactFilesJob],
})
export class ErasedContactFilesModule {}
