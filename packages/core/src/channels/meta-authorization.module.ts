import { Module } from '@nestjs/common';

import type { MetaAuthorizationDriver } from '@dakly/providers/channel/channel-driver';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';
import { MetaGraphChannelDriver } from '@dakly/providers/channel/meta/meta-graph-channel-driver';

import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { TeamModule } from '../team/team.module';
import { ChannelConnectionsController } from './channel-connections.controller';
import { ChannelConnectionsRepository } from './channel-connections.repository';
import { ChannelConnectionsService } from './channel-connections.service';
import { MetaAuthorizationController } from './meta-authorization.controller';
import { META_AUTHORIZATION_DRIVER, MetaAuthorizationService } from './meta-authorization.service';

function createMetaAuthorizationDriver(): MetaAuthorizationDriver | null {
  const configuration = loadEnv().metaChannel;
  if (!configuration) return null;
  return configuration.driver === 'fake'
    ? new FakeMetaChannelDriver(configuration.redirectUri)
    : new MetaGraphChannelDriver(configuration);
}

@Module({
  imports: [CacheModule, ClockModule, CryptoModule, OutboxModule, TeamModule],
  controllers: [MetaAuthorizationController, ChannelConnectionsController],
  providers: [
    { provide: META_AUTHORIZATION_DRIVER, useFactory: createMetaAuthorizationDriver },
    MetaAuthorizationService,
    ChannelConnectionsService,
    ChannelConnectionsRepository,
  ],
})
export class MetaAuthorizationModule {}
