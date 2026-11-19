import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  createSavedReplySchema,
  savedReplyListQuerySchema,
  updateSavedReplySchema,
  type CreateSavedReplyInput,
  type SavedReplyListQuery,
  type UpdateSavedReplyInput,
} from '@dakly/contracts/saved-replies';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SavedRepliesService } from './saved-replies.service';

@Controller('saved-replies')
export class SavedRepliesController {
  constructor(@Inject(SavedRepliesService) private readonly replies: SavedRepliesService) {}

  @Get()
  @RequirePermission('chats.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(savedReplyListQuerySchema)) query: SavedReplyListQuery,
  ) {
    return this.replies.list(storeId, query);
  }

  @Post()
  @RequirePermission('chats.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createSavedReplySchema)) input: CreateSavedReplyInput,
  ) {
    return this.replies.create(storeId, userId, input);
  }

  @Patch(':savedReplyId')
  @RequirePermission('chats.edit')
  update(
    @CurrentStore() storeId: string,
    @Param('savedReplyId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSavedReplySchema)) input: UpdateSavedReplyInput,
  ) {
    return this.replies.update(storeId, id, input);
  }

  @Delete(':savedReplyId')
  @RequirePermission('chats.edit')
  @HttpCode(204)
  remove(@CurrentStore() storeId: string, @Param('savedReplyId', ParseUUIDPipe) id: string) {
    return this.replies.remove(storeId, id);
  }
}
