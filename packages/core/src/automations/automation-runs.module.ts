import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { OrdersModule } from '../orders/orders.module';
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
import { AutomationConfirmationTapService } from './automation-confirmation-tap.service';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';
import { AutomationMessengerSendService } from './automation-messenger-send.service';
import { AutomationOrderTextService } from './automation-order-text.service';
import { AutomationRunsRepository } from './automation-runs.repository';
import { AutomationRunsService } from './automation-runs.service';
import { AutomationSendRetryService } from './automation-send-retry.service';
import { AutomationSmsDeliveryService } from './automation-sms-delivery.service';
import { AutomationsModule } from './automations.module';
import { AnswerAutomationConfirmationTap } from './jobs/answer-automation-confirmation-tap.job';

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
    OrdersModule,
    SegmentsModule,
    SendingModule,
    StoresModule,
    WalletsModule,
  ],
  providers: [
    AutomationConditionsService,
    AutomationConfirmationTapService,
    AnswerAutomationConfirmationTap,
    AutomationOrderTextService,
    AutomationRunsRepository,
    AutomationRunsService,
    AutomationEntryRepository,
    AutomationEntryService,
    AutomationSendRetryService,
    AutomationMessengerSendService,
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
