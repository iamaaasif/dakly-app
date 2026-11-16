import { Module } from '@nestjs/common';

import { ConsentsModule } from '../consents/consents.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { LinksController } from './links.controller';
import { LinksRepository } from './links.repository';
import { LinksService } from './links.service';

@Module({
  imports: [CacheModule, ClockModule, ConsentsModule, OutboxModule],
  controllers: [LinksController],
  providers: [LinksRepository, LinksService],
  exports: [LinksService],
})
export class LinksModule {}
