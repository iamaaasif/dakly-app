import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';

import {
  channelConnectionListQuerySchema,
  type ChannelConnectionListQuery,
} from '@dakly/contracts/channels';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ChannelConnectionsService } from './channel-connections.service';

@Controller('channel-connections')
export class ChannelConnectionsController {
  constructor(
    @Inject(ChannelConnectionsService) private readonly channels: ChannelConnectionsService,
  ) {}

  @Get()
  @RequirePermission('storeSettings.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(channelConnectionListQuerySchema))
    query: ChannelConnectionListQuery,
  ) {
    return this.channels.list(storeId, query);
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
