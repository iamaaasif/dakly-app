import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { LinksModule } from '../links/links.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { ErrorReportingModule } from '../platform/logging/error-reporting.module';
import { QUEUES } from '../platform/queue/queues';
import { SmsModule } from '../sms/sms.module';
import { CampaignCancellationsRepository } from './campaign-cancellations.repository';
import { CampaignCancellationsService } from './campaign-cancellations.service';
import { CampaignsModule } from './campaigns.module';
import { SettleCancelledCampaignJob } from './jobs/settle-cancelled-campaign.job';
import { SweepCampaignCancellationsJob } from './jobs/sweep-campaign-cancellations.job';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.campaign }),
    CacheModule,
    CampaignsModule,
    ClockModule,
    ErrorReportingModule,
    LinksModule,
    SmsModule,
  ],
  providers: [
    CampaignCancellationsRepository,
    CampaignCancellationsService,
    SettleCancelledCampaignJob,
    SweepCampaignCancellationsJob,
  ],
})
export class CampaignCancellationWorkerModule {}
