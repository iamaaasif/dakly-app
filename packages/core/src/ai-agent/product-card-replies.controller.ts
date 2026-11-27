import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  sendConversationProductSchema,
  type SendConversationProductInput,
} from '@dakly/contracts/chats';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProductCardRepliesService } from './product-card-replies.service';

@Controller('conversations')
export class ProductCardRepliesController {
  constructor(
    @Inject(ProductCardRepliesService) private readonly productCards: ProductCardRepliesService,
  ) {}

  @Post(':conversationId/products')
  @RequirePermission('chats.edit')
  send(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendConversationProductSchema)) input: SendConversationProductInput,
  ) {
    return this.productCards.send(storeId, id, userId, input);
  }
}
