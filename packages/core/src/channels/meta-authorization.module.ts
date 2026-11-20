import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { TeamModule } from '../team/team.module';
import { ChannelConnectionsController } from './channel-connections.controller';
import { ChannelConnectionsRepository } from './channel-connections.repository';
import { ChannelConnectionsService } from './channel-connections.service';
import { MetaAuthorizationController } from './meta-authorization.controller';
import { MetaAuthorizationService } from './meta-authorization.service';
import { META_CHANNEL_DRIVER, createMetaChannelDriver } from './meta-channel-driver';
import { MetaPageSubscriptionsRepository } from './meta-page-subscriptions.repository';
import { MetaPageSubscriptionsService } from './meta-page-subscriptions.service';

@Module({
  imports: [CacheModule, ClockModule, CryptoModule, NotificationsModule, OutboxModule, TeamModule],
  controllers: [MetaAuthorizationController, ChannelConnectionsController],
  providers: [
    { provide: META_CHANNEL_DRIVER, useFactory: createMetaChannelDriver },
    MetaAuthorizationService,
    ChannelConnectionsService,
    ChannelConnectionsRepository,
    MetaPageSubscriptionsRepository,
    MetaPageSubscriptionsService,
  ],
  exports: [ChannelConnectionsRepository, ChannelConnectionsService, MetaPageSubscriptionsService],
})
export class MetaAuthorizationModule {}
