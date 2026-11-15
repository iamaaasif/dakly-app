import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  createStoreSchema,
  type CreateStoreInput,
  type StoreResponse,
} from '@dakly/contracts/stores';

import { RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentSession } from '../platform/tenancy/current-session.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StoresService } from './stores.service';

@Controller('stores')
@RequireUser()
export class StoresController {
  constructor(@Inject(StoresService) private readonly stores: StoresService) {}
  @Post()
  async create(
    @CurrentUser() userId: string,
    @CurrentSession() sessionId: string,
    @Body(new ZodValidationPipe(createStoreSchema)) input: CreateStoreInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StoreResponse> {
    const result = await this.stores.create(userId, sessionId, input);
    reply.status(result.isCreated ? 201 : 200);
    return result.store;
  }
}
