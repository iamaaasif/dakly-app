import {
  Body,
  Controller,
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
  conversationListQuerySchema,
  conversationMessageListQuerySchema,
  createConversationNoteSchema,
  takeOverConversationSchema,
  updateConversationSchema,
  type ConversationListQuery,
  type ConversationMessageListQuery,
  type CreateConversationNoteInput,
  type TakeOverConversationInput,
  type UpdateConversationInput,
} from '@dakly/contracts/chats';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { InboxService } from './inbox.service';

@Controller('conversations')
export class InboxController {
  constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

  @Get()
  @RequirePermission('chats.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(conversationListQuerySchema)) query: ConversationListQuery,
  ) {
    return this.inbox.list(storeId, query);
  }

  @Get('counts')
  @RequirePermission('chats.view')
  counts(@CurrentStore() storeId: string) {
    return this.inbox.counts(storeId);
  }

  @Get(':conversationId')
  @RequirePermission('chats.view')
  get(@CurrentStore() storeId: string, @Param('conversationId', ParseUUIDPipe) id: string) {
    return this.inbox.get(storeId, id);
  }

  @Get(':conversationId/messages')
  @RequirePermission('chats.view')
  messages(
    @CurrentStore() storeId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(conversationMessageListQuerySchema))
    query: ConversationMessageListQuery,
  ) {
    return this.inbox.messages(storeId, id, query);
  }

  @Patch(':conversationId')
  @RequirePermission('chats.edit')
  update(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) input: UpdateConversationInput,
  ) {
    return this.inbox.update(storeId, id, userId, input);
  }

  @Post(':conversationId/notes')
  @RequirePermission('chats.edit')
  addNote(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createConversationNoteSchema)) input: CreateConversationNoteInput,
  ) {
    return this.inbox.addNote(storeId, id, { kind: 'user', userId }, input);
  }

  @Post(':conversationId/take-over')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  takeOver(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(takeOverConversationSchema)) input: TakeOverConversationInput,
  ) {
    return this.inbox.setResponder(
      storeId,
      id,
      { kind: 'user', userId },
      { ...input, responder: 'human' },
    );
  }

  @Post(':conversationId/return-to-ai')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  returnToAi(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ) {
    return this.inbox.setResponder(storeId, id, { kind: 'user', userId }, { responder: 'ai' });
  }
}
