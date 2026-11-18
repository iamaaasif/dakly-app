import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { ClockModule } from '../platform/clock.module';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';

// Only the worker runs workflows; the API's AutomationsModule edits and publishes them.
@Module({
  imports: [ClockModule, ContactsModule, SegmentsModule, SendingModule, StoresModule],
  providers: [AutomationRunsRepository, AutomationRunsService],
  exports: [AutomationRunsService],
})
export class AutomationRunsModule {}
