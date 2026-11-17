import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    ContactsModule,
    ClockModule,
    LinksModule,
    MessagingModule,
    OutboxModule,
    SegmentsModule,
    SendingModule,
    StoresModule,
    TeamModule,
    WalletsModule,
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsRepository,
    CampaignSendingRepository,
    CampaignsService,
    CampaignSenderService,
  ],
  exports: [CampaignSenderService],
})
export class CampaignsModule {}
