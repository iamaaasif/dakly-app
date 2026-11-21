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
  commentListQuerySchema,
  commentReplySchema,
  type CommentListQuery,
  type CommentReplyInput,
} from '@dakly/contracts/comments';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { CommentsService } from './comments.service';

@Controller('comments')
export class CommentsController {
  constructor(@Inject(CommentsService) private readonly comments: CommentsService) {}

  @Get()
  @RequirePermission('chats.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(commentListQuerySchema)) query: CommentListQuery,
  ) {
    return this.comments.list(storeId, query);
  }

  @Post(':commentId/reply')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  reply(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('commentId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(commentReplySchema)) input: CommentReplyInput,
  ) {
    return this.comments.replyPublicly(storeId, userId, id, input);
  }

  @Post(':commentId/private-reply')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  privateReply(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('commentId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(commentReplySchema)) input: CommentReplyInput,
  ) {
    return this.comments.replyPrivately(storeId, userId, id, input);
  }

  @Post(':commentId/hide')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  hide(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('commentId', ParseUUIDPipe) id: string,
  ) {
    return this.comments.setHidden(storeId, userId, id, true);
  }

  @Post(':commentId/unhide')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  unhide(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('commentId', ParseUUIDPipe) id: string,
  ) {
    return this.comments.setHidden(storeId, userId, id, false);
  }
}
