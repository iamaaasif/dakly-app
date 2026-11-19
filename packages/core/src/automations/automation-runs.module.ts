import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ErrorReportingModule } from '../platform/logging/error-reporting.module';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AutomationConditionsService } from './automation-conditions.service';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';
import { AutomationSmsDeliveryService } from './automation-sms-delivery';

// Only the worker runs workflows; the API's AutomationsModule edits and publishes them.
@Module({
  imports: [
    ContactsModule,
    ErrorReportingModule,
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
    AutomationSmsDeliveryService,
  ],
  exports: [AutomationRunsService],
})
export class AutomationRunsModule {}
