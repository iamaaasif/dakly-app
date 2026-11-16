import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    ClockModule,
    OutboxModule,
    SegmentsModule,
    SendingModule,
    StoresModule,
    TeamModule,
    WalletsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsRepository, CampaignsService],
})
export class CampaignsModule {}
