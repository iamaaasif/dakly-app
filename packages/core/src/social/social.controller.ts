import {
  Body,
  Controller,
  Delete,
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
  createPostSchema,
  editPostSchema,
  postIdempotencyKeySchema,
  postListQuerySchema,
  reschedulePostSchema,
  schedulePostSchema,
  type CreatePostInput,
  type EditPostInput,
  type PostListQuery,
  type PostListResponse,
  type PostResponse,
  type ReschedulePostInput,
  type SchedulePostInput,
} from '@dakly/contracts/social';
import type { StoreAccess } from '@dakly/contracts/team';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { RequireWritableStore } from '../platform/tenancy/writable-store.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { SocialRescheduleService } from './social-reschedule.service';
import { SocialService } from './social.service';

const idempotencyKeyPipe = new ZodValidationPipe(postIdempotencyKeySchema);

@Controller('posts')
export class SocialController {
  constructor(
    @Inject(SocialService) private readonly social: SocialService,
    @Inject(SocialRescheduleService) private readonly reschedule: SocialRescheduleService,
  ) {}

  @Post()
  @RequirePermission('social.edit')
  createDraft(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(createPostSchema)) input: CreatePostInput,
  ): Promise<PostResponse> {
    return this.social.createDraft(storeId, input, idempotencyKeyPipe.transform(key), {
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

  @Post(':postId/duplicate')
  @RequirePermission('social.edit')
  duplicatePost(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<PostResponse> {
    return this.social.duplicatePost(storeId, postId, { kind: 'user', userId }, access);
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

  @Post(':postId/approve')
  @RequireWritableStore()
  @RequirePermission('social.edit')
  @HttpCode(200)
  approveDraft(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('postId', ParseUUIDPipe) postId: string,
  ): Promise<PostResponse> {
    return this.social.approveDraft(storeId, postId, { actor: { kind: 'user', userId }, access });
  }

  @Post(':postId/schedule')
  @RequireWritableStore()
  @RequirePermission('social.edit')
  @HttpCode(200)
  schedulePost(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(schedulePostSchema)) input: SchedulePostInput,
  ): Promise<PostResponse> {
    return this.social.schedulePost(storeId, postId, input, {
      actor: { kind: 'user', userId },
      access,
    });
  }

  @Post(':postId/reschedule')
  @RequireWritableStore()
  @RequirePermission('social.edit')
  @HttpCode(200)
  reschedulePost(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @CurrentAccess() access: StoreAccess,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(new ZodValidationPipe(reschedulePostSchema)) input: ReschedulePostInput,
  ): Promise<PostResponse> {
    return this.reschedule.reschedulePost(storeId, postId, input, {
      actor: { kind: 'user', userId },
      access,
    });
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
