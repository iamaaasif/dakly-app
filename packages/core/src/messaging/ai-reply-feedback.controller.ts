import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';

import {
  aiFeedbackQuerySchema,
  fixAiReplySchema,
  rateAiReplySchema,
  type AiFeedbackQuery,
  type AiFeedbackResponse,
  type FixAiReplyInput,
  type RateAiReplyInput,
} from '@dakly/contracts/ai-feedback';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AiReplyFeedbackService } from './ai-reply-feedback.service';

@Controller('ai-replies')
export class AiReplyFeedbackController {
  constructor(@Inject(AiReplyFeedbackService) private readonly feedback: AiReplyFeedbackService) {}

  @Get('feedback')
  @RequirePermission('chats.view')
  list(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(aiFeedbackQuerySchema)) query: AiFeedbackQuery,
  ): Promise<AiFeedbackResponse> {
    return this.feedback.feedback(storeId, query);
  }

  @Put(':messageId/rating')
  @HttpCode(204)
  @RequirePermission('chats.edit')
  rate(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(rateAiReplySchema)) input: RateAiReplyInput,
  ): Promise<void> {
    return this.feedback.rate(storeId, { kind: 'user', userId }, messageId, input);
  }

  @Post(':messageId/fix')
  @HttpCode(204)
  @RequirePermission('chats.edit')
  fix(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(fixAiReplySchema)) input: FixAiReplyInput,
  ): Promise<void> {
    return this.feedback.fix(storeId, { kind: 'user', userId }, messageId, input);
  }
}
