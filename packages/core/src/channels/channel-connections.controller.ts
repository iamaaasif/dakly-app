import { Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe } from '@nestjs/common';

import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ChannelConnectionsService } from './channel-connections.service';

@Controller('channel-connections')
export class ChannelConnectionsController {
  constructor(
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
  ) {}

  @Get()
  @RequirePermission('storeSettings.view')
  list(@CurrentStore() storeId: string) {
    return this.channels.list(storeId);
  }

  @Delete(':channelConnectionId')
  @RequirePermission('storeSettings.edit')
  @HttpCode(204)
  disconnect(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('channelConnectionId', ParseUUIDPipe) channelConnectionId: string,
  ) {
    return this.channels.disconnect(storeId, channelConnectionId, access);
  }
}
