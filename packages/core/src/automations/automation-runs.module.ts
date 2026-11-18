import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';

// Only the worker runs workflows; the API's AutomationsModule edits and publishes them.
@Module({
  imports: [ClockModule],
  providers: [AutomationRunsRepository, AutomationRunsService],
  exports: [AutomationRunsService],
})
export class AutomationRunsModule {}
