import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { SavedRepliesController } from './saved-replies.controller';
import { SavedRepliesRepository } from './saved-replies.repository';
import { SavedRepliesService } from './saved-replies.service';

@Module({
  imports: [ClockModule, StoresModule],
  providers: [SavedRepliesRepository, SavedRepliesService],
  controllers: [SavedRepliesController],
})
export class SavedRepliesModule {}
