import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { StaffHistoryRepository } from './staff-history.repository';
import { StaffHistoryService } from './staff-history.service';

@Module({
  imports: [ClockModule],
  providers: [StaffHistoryRepository, StaffHistoryService],
  exports: [StaffHistoryService],
})
export class StaffHistoryModule {}
