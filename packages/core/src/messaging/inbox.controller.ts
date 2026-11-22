import {
  Body,
  Controller,
  Get,
  Headers,
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
  changeConversationLabelSchema,
  conversationMessageListQuerySchema,
  createConversationNoteSchema,
  createConversationReplySchema,
  takeOverConversationSchema,
  updateConversationSchema,
  type ChangeConversationLabelInput,
  type ConversationListQuery,
  type ConversationMessageListQuery,
  type CreateConversationNoteInput,
  type CreateConversationReplyInput,
  type TakeOverConversationInput,
  type UpdateConversationInput,
} from '@dakly/contracts/chats';
import {
  createConversationOrderSchema,
  orderIdempotencyKeySchema,
  type CreateConversationOrderInput,
} from '@dakly/contracts/orders';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ConversationOrdersService } from './conversation-orders.service';
import { ConversationReplyService } from './conversation-reply.service';
import { InboxService } from './inbox.service';

@Controller('conversations')
export class InboxController {
  constructor(
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(ConversationReplyService) private readonly replies: ConversationReplyService,
    @Inject(ConversationOrdersService) private readonly orders: ConversationOrdersService,
  ) {}

  @Get()
  @RequirePermission('chats.view')
  list(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(conversationListQuerySchema)) query: ConversationListQuery,
  ) {
    return this.inbox.list(storeId, query, access, { kind: 'user', userId });
  }

  @Get('assignees')
  @RequirePermission('chats.view')
  assignees(@CurrentStore() storeId: string) {
    return this.inbox.assignees(storeId);
  }

  @Get('labels')
  @RequirePermission('chats.view')
  labels(@CurrentStore() storeId: string) {
    return this.inbox.labels(storeId);
  }

  @Get('counts')
  @RequirePermission('chats.view')
  counts(@CurrentStore() storeId: string) {
    return this.inbox.counts(storeId);
  }

  @Get('summary')
  @RequirePermission('chats.view')
  summary(@CurrentStore() storeId: string, @CurrentAccess() access: StoreAccess) {
    return this.inbox.summary(storeId, access);
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

  @Post(':conversationId/read')
  @RequirePermission('chats.view')
  @HttpCode(200)
  markRead(@CurrentStore() storeId: string, @Param('conversationId', ParseUUIDPipe) id: string) {
    return this.inbox.markRead(storeId, id);
  }

  @Post(':conversationId/replies')
  @RequirePermission('chats.edit')
  reply(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createConversationReplySchema)) input: CreateConversationReplyInput,
  ) {
    return this.replies.reply(storeId, id, userId, input);
  }

  @Post(':conversationId/orders')
  @RequirePermission('orders.edit')
  placeOrder(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createConversationOrderSchema)) input: CreateConversationOrderInput,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const idempotencyKey = new ZodValidationPipe(orderIdempotencyKeySchema).transform(key);
    return this.orders.place(storeId, id, { userId, access, idempotencyKey }, input);
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

  @Post(':conversationId/labels')
  @RequirePermission('chats.edit')
  @HttpCode(200)
  changeLabel(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeConversationLabelSchema)) input: ChangeConversationLabelInput,
  ) {
    return this.inbox.changeLabel(storeId, id, { kind: 'user', userId }, input);
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
