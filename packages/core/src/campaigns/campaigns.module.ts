import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [ClockModule],
  controllers: [CampaignsController],
  providers: [CampaignsRepository, CampaignsService],
})
export class CampaignsModule {}
