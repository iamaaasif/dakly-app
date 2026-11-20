import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  confirmPostPhotoSchema,
  postPhotoUploadSchema,
  type ConfirmPostPhotoInput,
  type PostPhotoResponse,
  type PostPhotoUploadInput,
  type PostPhotoUploadResponse,
} from '@dakly/contracts/social';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { PostMediaService } from './post-media.service';

@Controller('post-media')
export class PostMediaController {
  constructor(@Inject(PostMediaService) private readonly media: PostMediaService) {}

  @Post('upload-url')
  @RequirePermission('social.edit')
  @HttpCode(200)
  requestUpload(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(postPhotoUploadSchema)) input: PostPhotoUploadInput,
  ): PostPhotoUploadResponse {
    return this.media.requestUpload(storeId, input);
  }

  @Post('confirm')
  @RequirePermission('social.edit')
  confirm(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(confirmPostPhotoSchema)) input: ConfirmPostPhotoInput,
  ): Promise<PostPhotoResponse> {
    return this.media.confirm(storeId, userId, input);
  }
}
