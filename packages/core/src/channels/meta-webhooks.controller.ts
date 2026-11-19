import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  metaWebhookVerificationSchema,
  type MetaWebhookVerification,
} from '@dakly/contracts/meta-webhooks';

import { ProviderCallback, Public } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MetaWebhooksService } from './meta-webhooks.service';

@Controller('webhooks/meta')
@Public()
export class MetaWebhooksController {
  constructor(@Inject(MetaWebhooksService) private readonly webhooks: MetaWebhooksService) {}

  @Get()
  @ProviderCallback()
  verify(
    @Query(new ZodValidationPipe(metaWebhookVerificationSchema)) input: MetaWebhookVerification,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const challenge = this.webhooks.verifySubscription(input);
    reply.type('text/plain; charset=utf-8');
    return challenge;
  }

  @Post()
  @ProviderCallback()
  @RouteConfig({ rawJson: true })
  @HttpCode(200)
  receive(@Req() request: RawBodyRequest<FastifyRequest>) {
    const signature = request.headers['x-hub-signature-256'];
    return this.webhooks.receiveDelivery(
      request.rawBody,
      typeof signature === 'string' ? signature : '',
    );
  }
}
