import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  createPostSchema,
  editPostSchema,
  postCreateKeySchema,
  postListQuerySchema,
  type CreatePostInput,
  type EditPostInput,
  type PostListQuery,
  type PostListResponse,
  type PostResponse,
} from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SocialService } from './social.service';

const createKeyPipe = new ZodValidationPipe(postCreateKeySchema);

@Controller('posts')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post()
  @RequirePermission('social.edit')
  createDraft(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(createPostSchema)) input: CreatePostInput,
  ): Promise<PostResponse> {
    return this.social.createDraft(storeId, input, createKeyPipe.transform(key), {
      kind: 'user',
      userId,
    });
  }

  @Get()
  @RequirePermission('social.view')
  listPosts(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(postListQuerySchema)) query: PostListQuery,
  ): Promise<PostListResponse> {
    return this.social.listPosts(storeId, query, { kind: 'user', userId }, access);
  }

  @Get(':postId')
  @RequirePermission('social.view')
  getPost(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<PostResponse> {
    return this.social.getPost(storeId, postId, { kind: 'user', userId }, access);
  }

  @Patch(':postId')
  @RequirePermission('social.edit')
  editDraft(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(editPostSchema)) input: EditPostInput,
  ): Promise<PostResponse> {
    return this.social.editDraft(storeId, postId, input, { kind: 'user', userId });
  }

  @Delete(':postId')
  @RequirePermission('social.edit')
  @HttpCode(204)
  deleteDraft(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<void> {
    return this.social.deleteDraft(storeId, postId, { kind: 'user', userId });
  }
}
