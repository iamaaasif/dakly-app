import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';

import {
  askTestSchema,
  saveTestersSchema,
  saveTestQuestionsSchema,
  type AskTestInput,
  type SaveTestersInput,
  type SaveTestQuestionsInput,
  type TestersResponse,
  type TestAnswerResponse,
  type TestQuestionsResponse,
} from '@dakly/contracts/ai-practice';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AiPracticeService } from './ai-practice.service';

@Controller('ai-agent')
export class AiPracticeController {
  constructor(@Inject(AiPracticeService) private readonly practice: AiPracticeService) {}

  @Get('test-questions')
  @RequirePermission('storeSettings.view')
  testQuestions(@CurrentStore() storeId: string): Promise<TestQuestionsResponse> {
    return this.practice.testQuestions(storeId);
  }

  @Put('test-questions')
  @RequirePermission('storeSettings.edit')
  saveTestQuestions(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveTestQuestionsSchema)) input: SaveTestQuestionsInput,
  ): Promise<TestQuestionsResponse> {
    return this.practice.saveTestQuestions(storeId, userId, input.questions);
  }

  @Get('testers')
  @RequirePermission('storeSettings.view')
  testers(@CurrentStore() storeId: string): Promise<TestersResponse> {
    return this.practice.testers(storeId);
  }

  @Put('testers')
  @RequirePermission('storeSettings.edit')
  saveTesters(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveTestersSchema)) input: SaveTestersInput,
  ): Promise<TestersResponse> {
    return this.practice.saveTesters(storeId, userId, input.contactIds);
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermission('storeSettings.edit')
  ask(
    @CurrentStore() storeId: string,
    @Body(new ZodValidationPipe(askTestSchema)) input: AskTestInput,
  ): Promise<TestAnswerResponse> {
    return this.practice.ask(storeId, input.question);
  }

  @Post('channel-connections/:channelConnectionId/go-live')
  @HttpCode(204)
  @RequirePermission('storeSettings.edit')
  goLive(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Param('channelConnectionId', ParseUUIDPipe) channelConnectionId: string,
  ) {
    return this.practice.goLive(storeId, userId, channelConnectionId);
  }
}
