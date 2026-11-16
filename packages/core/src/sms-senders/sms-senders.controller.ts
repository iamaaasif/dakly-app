import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  requestSmsSenderIdSchema,
  smsSenderIdListQuerySchema,
  type RequestSmsSenderIdInput,
  type SmsSenderIdListQuery,
  type SmsSenderIdListResponse,
  type SmsSenderIdResponse,
} from '@dakly/contracts/sms-senders';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SmsSendersService } from './sms-senders.service';

@Controller('sms-sender-ids')
export class SmsSendersController {
  constructor(@Inject(SmsSendersService) private readonly smsSenders: SmsSendersService) {}

  @Get()
  @RequirePermission('storeSettings.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(smsSenderIdListQuerySchema)) query: SmsSenderIdListQuery,
  ): Promise<SmsSenderIdListResponse> {
    return this.smsSenders.list(storeId, query);
  }

  @Post()
  @RequirePermission('storeSettings.edit')
  request(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(requestSmsSenderIdSchema)) input: RequestSmsSenderIdInput,
  ): Promise<SmsSenderIdResponse> {
    return this.smsSenders.request(storeId, input, { kind: 'user', userId });
  }

  @Post(':smsSenderIdId/test')
  @RequirePermission('storeSettings.edit')
  @HttpCode(204)
  sendTest(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('smsSenderIdId', ParseUUIDPipe) smsSenderIdId: string,
  ): Promise<void> {
    return this.smsSenders.sendTest(storeId, smsSenderIdId, userId);
  }
}
