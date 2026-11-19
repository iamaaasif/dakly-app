import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { ErrorReportingModule } from '../platform/logging/error-reporting.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AutomationBirthdaySweepService } from './automation-birthday-sweep.service';
import { AutomationBirthdaysService } from './automation-birthdays.service';
import { AutomationConditionsService } from './automation-conditions.service';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';
import { AutomationSmsDeliveryService } from './automation-sms-delivery.service';
import { AutomationsModule } from './automations.module';

// Only the worker runs workflows; the API's AutomationsModule edits and publishes them.
@Module({
  imports: [
    AutomationsModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
    ClockModule,
    ContactsModule,
    ErrorReportingModule,
    OutboxModule,
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
    AutomationSmsDeliveryService,
    AutomationBirthdaysService,
    AutomationBirthdaySweepService,
  ],
  exports: [
    AutomationRunsService,
    AutomationEntryService,
    AutomationBirthdaysService,
    AutomationBirthdaySweepService,
  ],
})
export class AutomationRunsModule {}
