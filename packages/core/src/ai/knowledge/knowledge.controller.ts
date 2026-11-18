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
  changeKnowledgeItemSchema,
  createKnowledgeItemSchema,
  listKnowledgeItemsQuerySchema,
  type ChangeKnowledgeItemInput,
  type CreateKnowledgeItemInput,
  type KnowledgeItemListResponse,
  type KnowledgeItemResponse,
  type ListKnowledgeItemsQuery,
} from '@dakly/contracts/knowledge';

import { RequirePermission } from '../../platform/tenancy/access.decorators';
import { CurrentStore } from '../../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../../platform/validation/zod-validation.pipe';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge-items')
export class KnowledgeController {
  constructor(@Inject(KnowledgeService) private readonly knowledge: KnowledgeService) {}

  @Post()
  @RequirePermission('chats.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createKnowledgeItemSchema)) input: CreateKnowledgeItemInput,
  ): Promise<KnowledgeItemResponse> {
    return this.knowledge.create(storeId, { kind: 'user', userId }, input);
  }

  @Get()
  @RequirePermission('chats.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(listKnowledgeItemsQuerySchema)) query: ListKnowledgeItemsQuery,
  ): Promise<KnowledgeItemListResponse> {
    return this.knowledge.list(storeId, query);
  }

  @Get(':knowledgeItemId')
  @RequirePermission('chats.view')
  view(
    @CurrentStore() storeId: string,
    @Param('knowledgeItemId', ParseUUIDPipe) itemId: string,
  ): Promise<KnowledgeItemResponse> {
    return this.knowledge.view(storeId, itemId);
  }

  @Patch(':knowledgeItemId')
  @RequirePermission('chats.edit')
  change(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('knowledgeItemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(changeKnowledgeItemSchema)) input: ChangeKnowledgeItemInput,
  ): Promise<KnowledgeItemResponse> {
    return this.knowledge.change(storeId, itemId, input, { kind: 'user', userId });
  }

  @Delete(':knowledgeItemId')
  @HttpCode(204)
  @RequirePermission('chats.edit')
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('knowledgeItemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.knowledge.remove(storeId, itemId, { kind: 'user', userId });
  }
}
