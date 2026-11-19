import { Body, Controller, Get, Put, Query } from '@nestjs/common';

import {
  postingSlotsQuerySchema,
  savePostingSlotsSchema,
  type PostingSlotsQuery,
  type PostingSlotsResponse,
  type SavePostingSlotsInput,
} from '@dakly/contracts/social';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { PostingSlotsService } from './posting-slots.service';

@Controller('posts/queue-slots')
export class PostingSlotsController {
  constructor(private readonly slots: PostingSlotsService) {}

  @Get()
  @RequirePermission('social.view')
  postingSlots(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(postingSlotsQuerySchema)) query: PostingSlotsQuery,
  ): Promise<PostingSlotsResponse> {
    return this.slots.postingSlots(storeId, query.channelConnectionId);
  }

  @Put()
  @RequirePermission('social.edit')
  replaceSlots(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(savePostingSlotsSchema)) input: SavePostingSlotsInput,
  ): Promise<PostingSlotsResponse> {
    return this.slots.replaceSlots(storeId, input, { kind: 'user', userId });
  }
}
