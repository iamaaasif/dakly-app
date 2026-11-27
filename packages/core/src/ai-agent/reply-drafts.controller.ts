import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';

import {
  writeConversationReplySchema,
  type WriteConversationReplyInput,
} from '@dakly/contracts/chats';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ReplyDraftsService } from './reply-drafts.service';

@Controller('conversations')
export class ReplyDraftsController {
  constructor(@Inject(ReplyDraftsService) private readonly drafts: ReplyDraftsService) {}

  @Post(':conversationId/reply-drafts')
  @HttpCode(200)
  @RequirePermission('chats.edit')
  write(
    @CurrentStore() storeId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(writeConversationReplySchema)) input: WriteConversationReplyInput,
  ) {
    return this.drafts.write(storeId, id, input);
  }
}
