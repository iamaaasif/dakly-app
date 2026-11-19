import { Module } from '@nestjs/common';

import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { TeamModule } from '../team/team.module';
import { ChannelConnectionsController } from './channel-connections.controller';
import { ChannelConnectionsRepository } from './channel-connections.repository';
import { ChannelConnectionsService } from './channel-connections.service';
import { MetaAuthorizationController } from './meta-authorization.controller';
import { META_AUTHORIZATION_DRIVER, MetaAuthorizationService } from './meta-authorization.service';
import { createMetaChannelDriver } from './meta-channel-driver';

@Module({
  imports: [CacheModule, ClockModule, CryptoModule, OutboxModule, TeamModule],
  controllers: [MetaAuthorizationController, ChannelConnectionsController],
  providers: [
    { provide: META_AUTHORIZATION_DRIVER, useFactory: createMetaChannelDriver },
    MetaAuthorizationService,
    ChannelConnectionsService,
    ChannelConnectionsRepository,
  ],
})
export class MetaAuthorizationModule {}
