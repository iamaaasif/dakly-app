import { Module } from '@nestjs/common';

import { Clock } from '../clock';
import { ClockModule } from '../clock.module';
import { createFileStorageDriver, FILE_STORAGE_DRIVER } from './file-storage.provider';

@Module({
  imports: [ClockModule],
  providers: [
    { provide: FILE_STORAGE_DRIVER, inject: [Clock], useFactory: createFileStorageDriver },
  ],
  exports: [FILE_STORAGE_DRIVER],
})
export class FileStorageModule {}
