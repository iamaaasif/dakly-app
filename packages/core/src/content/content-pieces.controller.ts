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
  contentPieceListQuerySchema,
  createContentPieceSchema,
  updateContentPieceSchema,
  type ContentPiece,
  type ContentPieceList,
  type ContentPieceListQuery,
  type CreateContentPieceInput,
  type UpdateContentPieceInput,
} from '@dakly/contracts/content';
import {
  contentWriteRequestSchema,
  type ContentWriteInput,
  type ContentWriteResult,
} from '@dakly/contracts/content-writing';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ContentService } from './content.service';

@Controller('content-pieces')
export class ContentPiecesController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}

  @Get()
  @RequirePermission('social.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(contentPieceListQuerySchema)) query: ContentPieceListQuery,
  ): Promise<ContentPieceList> {
    return this.content.listPieces(storeId, query);
  }

  @Get(':contentPieceId')
  @RequirePermission('social.view')
  get(
    @CurrentStore() storeId: string,
    @Param('contentPieceId', ParseUUIDPipe) id: string,
  ): Promise<ContentPiece> {
    return this.content.getPiece(storeId, id);
  }

  @Post()
  @RequirePermission('social.edit')
  create(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createContentPieceSchema)) input: CreateContentPieceInput,
  ): Promise<ContentPiece> {
    return this.content.createPiece(storeId, { kind: 'user', userId }, input);
  }

  @Post('generate')
  @HttpCode(200)
  @RequirePermission('social.edit')
  write(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(contentWriteRequestSchema)) input: ContentWriteInput,
  ): Promise<ContentWriteResult> {
    return this.content.write(storeId, access, input);
  }

  @Patch(':contentPieceId')
  @RequirePermission('social.edit')
  update(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('contentPieceId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContentPieceSchema)) input: UpdateContentPieceInput,
  ): Promise<ContentPiece> {
    return this.content.updatePiece(storeId, id, { kind: 'user', userId }, input);
  }

  @Delete(':contentPieceId')
  @RequirePermission('social.edit')
  @HttpCode(204)
  remove(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('contentPieceId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.content.deletePiece(storeId, id, { kind: 'user', userId });
  }
}
