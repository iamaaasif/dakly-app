import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';

import {
  askDaklyRequestSchema,
  type AskDaklyAnswer,
  type AskDaklyRequest,
} from '@dakly/contracts/assistant';
import type { StoreAccess } from '@dakly/contracts/team';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AssistantService } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  // Every role may ask; the tools offered depend on the areas the role can view.
  @Post('messages')
  @HttpCode(200)
  @AnyMember()
  ask(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Body(new ZodValidationPipe(askDaklyRequestSchema)) body: AskDaklyRequest,
  ): Promise<AskDaklyAnswer> {
    return this.assistant.ask(storeId, access, body);
  }
}
