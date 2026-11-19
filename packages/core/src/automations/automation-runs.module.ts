import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AutomationConditionsService } from './automation-conditions.service';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';

// Only the worker runs workflows; the API's AutomationsModule edits and publishes them.
@Module({
  imports: [
    ClockModule,
    ContactsModule,
    LinksModule,
    MessagingModule,
    SegmentsModule,
    SendingModule,
    StoresModule,
    WalletsModule,
  ],
  providers: [
    AutomationConditionsService,
    AutomationRunsRepository,
    AutomationRunsService,
    AutomationEntryRepository,
    AutomationEntryService,
  ],
  exports: [AutomationRunsService, AutomationEntryService],
})
export class AutomationRunsModule {}
