import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import {
  addRestockRequestSchema,
  type AddRestockRequestInput,
  restockRequestListQuerySchema,
  type RestockNotificationResponse,
  type RestockRequestListQuery,
  type RestockRequestListResponse,
  type RestockRequestResponse,
  type RestockWaitingResponse,
} from '@dakly/contracts/restock-requests';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { RestockRequestsService } from './restock-requests.service';

@Controller()
export class RestockRequestsController {
  constructor(@Inject(RestockRequestsService) private readonly service: RestockRequestsService) {}

  // Adding someone happens from a chat, so it needs the chat permission, not product editing.
  @Post('variants/:variantId/restock-requests')
  @RequirePermission('chats.edit')
  add(
    @CurrentStore() storeId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body(new ZodValidationPipe(addRestockRequestSchema)) input: AddRestockRequestInput,
  ): Promise<RestockRequestResponse> {
    return this.service.addToWaitingList(storeId, variantId, input);
  }

  @Get('restock-requests')
  @RequirePermission('products.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(restockRequestListQuerySchema)) query: RestockRequestListQuery,
  ): Promise<RestockRequestListResponse> {
    return this.service.list(storeId, query);
  }

  @Get('products/:productId/restock-waiting')
  @RequirePermission('products.view')
  waiting(
    @CurrentStore() storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<RestockWaitingResponse> {
    return this.service.waitingByProduct(storeId, productId);
  }

  @Delete('restock-requests/:id')
  @RequirePermission('products.edit')
  @HttpCode(204)
  cancel(@CurrentStore() storeId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.cancel(storeId, id);
  }

  @Post('variants/:variantId/restock-notifications')
  @RequirePermission('products.edit')
  @HttpCode(200)
  notify(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<RestockNotificationResponse> {
    return this.service.notifyWaiting(storeId, variantId, { kind: 'user', userId });
  }
}
